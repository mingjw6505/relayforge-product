#!/bin/sh
# POSIX shell and OS utilities only; runtimes are probed only if already present.
# Do not read stdin, product content, transcripts or credentials.
script_dir=${0%/*}
export PYTHON_MANAGER_AUTOMATIC_INSTALL=false PYTHONDONTWRITEBYTECODE=1
unset PYLAUNCHER_ALLOW_INSTALL PYLAUNCHER_ALWAYS_INSTALL

probe() {
    probe_status=missing
    probe_output=
    tool=$1
    shift
    tool_path=$(command -v "$tool") || return
    # A private, bounded probe avoids platform-specific timeout utilities.
    probe_dir=$(mktemp -d "${TMPDIR:-/tmp}/relayforge-runtime.XXXXXXXX") || {
        probe_status=probe_failed
        return
    }
    (ulimit -f 8 2>/dev/null || :; exec "$tool_path" "$@") > "$probe_dir/output" 2>/dev/null &
    worker=$!
    (
        sleep 2
        if kill -0 "$worker" 2>/dev/null; then
            : > "$probe_dir/timeout"
            kill -KILL "$worker" 2>/dev/null
        fi
    ) >/dev/null 2>&1 &
    watcher=$!
    wait "$worker" 2>/dev/null
    result=$?
    kill "$watcher" 2>/dev/null
    wait "$watcher" 2>/dev/null
    # Only fixed, recognized tokens are included in output. Never echo raw output.
    IFS= read -r probe_output < "$probe_dir/output"
    cr=$(printf '\r')
    probe_output=${probe_output%"$cr"}
    if [ "$result" -eq 0 ] && [ ! -f "$probe_dir/timeout" ]; then
        probe_status=ok
    else
        probe_status=probe_failed
    fi
    rm -f "$probe_dir/output" "$probe_dir/timeout"
    rmdir "$probe_dir"
}

probe node --version
node_status=$probe_status
if [ "$node_status" = ok ]; then
    case "$probe_output" in
        v[0-9]*.[0-9]*.[0-9]*)
            major=${probe_output#v}
            version=$major
            major=${major%%.*}
            minor_patch=${version#*.}
            minor=${minor_patch%%.*}
            patch=${minor_patch#*.}
            case "$major:$minor:$patch" in
                *[!0-9:]*|:*|*::*|*:) node_status=probe_failed ;;
                *)
                    if [ "${#major}" -gt 6 ]; then node_status=probe_failed
                    elif [ "$major" -ge 18 ]; then node_status=ready
                    else node_status=unsupported
                    fi
                    ;;
            esac
            ;;
        *) node_status=probe_failed ;;
    esac
fi

python_status=missing
for interpreter in python3 python; do
    probe "$interpreter" "$script_dir/python-probe.py"
    candidate=$probe_status
    if [ "$candidate" = ok ]; then
        case "$probe_output" in
            ready|unsupported|sqlite_unavailable) candidate=$probe_output ;;
            *) candidate=probe_failed ;;
        esac
    fi
    if [ "$candidate" = ready ]; then python_status=ready; break; fi
    case "$candidate:$python_status" in
        probe_failed:*) python_status=probe_failed ;;
        sqlite_unavailable:missing|sqlite_unavailable:unsupported) python_status=sqlite_unavailable ;;
        unsupported:missing) python_status=unsupported ;;
    esac
done

if [ "${1:-}" = --json ]; then
    printf '{"node":"%s","python":"%s","source":"native_startup","host_ui":"unverified"}\n' "$node_status" "$python_status"
    exit 0
fi
printf '{'
if [ "$node_status" != ready ] || [ "$python_status" != ready ]; then
    # This resource is one pre-escaped JSON string, so no JSON parser is needed.
    notice='"RelayForge Product startup check failed. Choose assisted setup, manual instructions, or continuing without installation. No software was installed."'
    if [ -r "$script_dir/runtime-notice.json" ]; then
        IFS= read -r notice < "$script_dir/runtime-notice.json"
    fi
    notice_text=${notice#\"}
    notice_text=${notice_text%\"}
    printf '"systemMessage":"Node.js=%s; Python=%s. %s",' "$node_status" "$python_status" "$notice_text"
fi
printf '"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"RelayForge Product native startup preflight: Node.js=%s; Python=%s. This check does not require either runtime. Minimums: Node.js 18+, Python 3.11+ with sqlite3. When RelayForge Product is used, explain missing or unsupported runtimes, show a concrete official install plan, and ask the user to choose assisted installation, manual instructions, or continuing without installation. probe_failed is uncertain: diagnose before prescribing installation. Never install automatically, treat silence as consent, or repeat an installation question after a prior decline. Do not create product requirements for setup. Do not ask installation questions for unrelated work. Runtime readiness does not prove MCP tool loading or UI rendering."}}\n' "$node_status" "$python_status"
