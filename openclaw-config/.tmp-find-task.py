import json
p = "/root/.openclaw/agents/main/sessions/30371618-2d9e-4811-8f1a-10946f7c80e2.jsonl"
target = "x6lx8zsntb3eqcx5ydp4nkf4"
with open(p) as f:
    lines = f.readlines()
print(f"total: {len(lines)}")
matches = [i for i, line in enumerate(lines) if target in line]
print(f"matches for {target}: {len(matches)}")
if not matches:
    raise SystemExit(0)
start = matches[0]
end = min(start + 60, len(lines))
print(f"showing entries {start}..{end}\n")
for i in range(start, end):
    try:
        obj = json.loads(lines[i])
        msg = obj.get("message", {})
        role = msg.get("role", "?")
        content = msg.get("content", "")
        ts = obj.get("timestamp", "")[:19]
        if isinstance(content, list):
            parts = []
            for c in content:
                if not isinstance(c, dict):
                    continue
                t = c.get("type", "?")
                if t == "thinking":
                    th = c.get("thinking", "")
                    parts.append(f"[think:{len(th)}c]")
                elif t == "text":
                    parts.append(f"[text:{c.get('text','')[:140]}]")
                elif t == "tool_use":
                    nm = c.get("name", "?")
                    inp = c.get("input", {})
                    if nm == "write":
                        path = inp.get("path", "")
                        cnt = inp.get("content", "")
                        parts.append(f"[WRITE path={path[-50:]} content_len={len(str(cnt))}]")
                    elif nm == "exec":
                        cmd = inp.get("command", "")
                        parts.append(f"[EXEC: {cmd[:120]}]")
                    elif nm == "sessions_spawn":
                        parts.append(f"[SPAWN: agent={inp.get('agentId','?')} msg={str(inp.get('message',''))[:100]}]")
                    else:
                        parts.append(f"[{nm}: {json.dumps(inp)[:100]}]")
                elif t == "tool_result":
                    rc = c.get("content", "")
                    if isinstance(rc, list):
                        rc = " ".join(str(x.get("text", x))[:80] for x in rc if isinstance(x, dict))
                    parts.append(f"[result:{str(rc)[:140]}]")
                else:
                    parts.append(f"[{t}]")
            content_str = " ".join(parts)
        else:
            content_str = str(content)[:200]
        print(f"[{i}] {ts} {role[:8]:8s} {content_str[:600]}")
    except Exception as e:
        print(f"[{i}] PARSE_ERR")
