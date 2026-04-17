import json
p = "/root/.openclaw/agents/main/sessions/30371618-2d9e-4811-8f1a-10946f7c80e2.jsonl"
# Look at entries 12720..12745 (what the user said BEFORE the TASK APPROVED at 12744)
with open(p) as f:
    lines = f.readlines()
for i in range(max(0, 12720), 12745):
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
                    parts.append(f"[think:{len(c.get('thinking',''))}c]")
                elif t == "text":
                    parts.append(f"[text:{c.get('text','')[:300]}]")
                elif t == "tool_use":
                    nm = c.get("name", "?")
                    parts.append(f"[TOOL:{nm}]")
                elif t == "tool_result":
                    parts.append(f"[result]")
            content_str = " ".join(parts)
        else:
            content_str = str(content)[:300]
        print(f"[{i}] {ts} {role[:8]:8s} {content_str[:600]}")
    except Exception as e:
        print(f"[{i}] PARSE_ERR")
