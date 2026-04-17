# Security notes for openclaw-config/

## Embedded secrets in current files

The rescued files **contain live secrets** as of 2026-04-06. This is the state on Hetzner today — we have copied them as-is for accurate restore. Be aware before pushing to a public repo.

### Secrets present

- **agents/main/SOUL.md** — contains the bridge auth Bearer token (`9b8d2c89...`) and the LSA tenant ID (`tnt_rljn1gj4cgxoph0hxfohv6l4`) hardcoded inline in curl examples
- **toolkits/nocodb.md** — contains the NocoDB `xc-token` (`HeaMngQVhQu4SfYZ6faDl8tf8-5o_JWz0vHqsB9M`) and the leads table ID
- **toolkits/notion.md** — currently uses `{token}` placeholder, no live secret embedded

### Other Hetzner secrets NOT in this repo

These live only in `/root/.openclaw/openclaw.json` on Hetzner and the encrypted backup tarballs in `backups/openclaw-2026-04-06/`:

- DeepSeek API key, OpenAI API key, Gemini API key, OpenRouter, Tavily, Perplexity, Brave, FAL, AgentMail
- OpenClaw gateway auth token (`87a186...`)

## What to do

1. **If this repo is private** → fine as-is, but rotate secrets if you ever change visibility
2. **If this repo is public or might become public**:
   - Sanitize main SOUL: replace `9b8d2c89...` with `${BRIDGE_AUTH_TOKEN}` and `tnt_rljn1gj4cgxoph0hxfohv6l4` with `${TENANT_ID}`
   - Sanitize nocodb.md: replace the xc-token with `${NOCODB_TOKEN}`
   - Update `deploy-config.sh` to envsubst the placeholders during deploy
   - Keep an unsanitized copy in your password manager for fast restore
3. **Rotation reminder**: After any incident exposing the conversation transcripts that contain these forensics outputs, **rotate everything**: bridge auth token, NocoDB token, all upstream API keys.

## Backup of secrets

The full encrypted state including all secrets lives in:

- `backups/openclaw-2026-04-06/2026-04-06T09-47-40.047Z-openclaw-backup.tar.gz` (OpenClaw native, 703 MB)
- `backups/openclaw-2026-04-06/raw-openclaw-20260406-094905.tar.gz` (raw tar including tenant dirs, 518 MB)

These tarballs should NEVER be committed to git. They are listed in `.gitignore` at the repo root.
