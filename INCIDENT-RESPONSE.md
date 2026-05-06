# Incident Response Policy — Ace Paste Cleaner Pro

**Owner:** ThinkWell Labs  
**Last updated:** 2026-05-06  
**Classification:** Internal — share with legal counsel and incident responders only

---

## 1. Scope

This policy covers all security incidents affecting:
- **acepaste.xyz** (Cloudflare Pages / GitHub Pages deployment)
- **Supabase project** `eqoltjofjlznlirbalrb` (auth, subscriptions, edge functions)
- **Stripe account** (billing, payment data — PCI scope owned by Stripe)
- **Chrome extension** `kgnnilelmfchdblcoefmokgcbpccbcci` (Chrome Web Store)

**What user data we hold:**
- Email addresses (Supabase `auth.users`)
- Subscription plan + Stripe customer ID (Supabase `subscriptions` table)
- Purchase restore attempt logs (email + timestamp, auto-purged after 30 days)
- CSP violation logs (no PII, auto-purged after 30 days)

**What we do NOT hold:**
- Passwords (Supabase handles hashing; we never see plaintext)
- Payment card data (100% in Stripe's PCI scope)
- Text content pasted by users (all processing is client-side; nothing uploaded)

---

## 2. Severity Classification

| Level | Definition | Example |
|-------|------------|---------|
| **P0 — Critical** | Active exploit, confirmed data exfiltration, or payment compromise | SQL injection actively running; Supabase service key exposed |
| **P1 — High** | Plausible exfiltration, auth bypass, or significant service disruption | Leaked anon key; RLS policy misconfiguration exposing rows |
| **P2 — Medium** | Potential vulnerability, no confirmed exploitation | Dependency with known CVE; CSP violation spike |
| **P3 — Low** | Theoretical risk, no user impact | Outdated minor dependency; single CSP report |

---

## 3. Detection Channels

| Source | What it catches |
|--------|-----------------|
| Supabase Dashboard → Logs | Edge function errors, DB query anomalies, auth failures |
| `csp_violations` table | Injection attempts, CSP regressions (query weekly) |
| Stripe Dashboard → Events | Unusual charge volumes, webhook failures |
| GitHub → Security Advisories | Dependency CVEs (enable Dependabot alerts) |
| Chrome Web Store → Developer Console | Extension crash reports |

**Anomaly signals to watch:**
- `restore_attempts` table: >20 attempts in 1 hour from a single `user_id`
- `csp_violations`: spike in `blocked-uri` values not from known third parties
- Supabase auth logs: >100 failed logins in 1 hour from a single IP
- Edge function error rate >5% over a 15-minute window

---

## 4. Response Procedures by Severity

### P0 — Critical (respond within 1 hour)

1. **Contain immediately**
   - Rotate `SUPABASE_SERVICE_ROLE_KEY`: Supabase Dashboard → Settings → API → Regenerate
   - Rotate `STRIPE_SECRET_KEY`: Stripe Dashboard → Developers → API keys → Roll key
   - Rotate `STRIPE_WEBHOOK_SECRET`: delete and recreate the webhook endpoint
   - If the Supabase anon key is compromised, regenerate it and update `_headers`, `auth.js`, and all edge function deployments

2. **Assess scope**
   - Run in Supabase SQL editor:
     ```sql
     -- What rows were touched?
     SELECT * FROM auth.audit_log_entries
     WHERE created_at > NOW() - INTERVAL '24 hours'
     ORDER BY created_at DESC LIMIT 200;
     ```
   - Check `subscriptions` for unexpected plan upgrades in the last 24h
   - Check Stripe for unexpected charges or refunds

3. **Notify affected users**
   - GDPR (EU users): 72-hour notification deadline to supervisory authority
   - CCPA (CA users): 30-day notification deadline to affected users
   - Email template: see Section 6

4. **Preserve evidence**
   - Export Supabase audit logs before rotating keys (rotation may flush logs)
   - Screenshot Stripe event log
   - Do NOT delete the compromised session or tokens until forensics are complete

5. **Root cause + remediation**
   - Document the attack vector
   - Apply fix and re-deploy
   - Post-mortem within 5 business days

### P1 — High (respond within 4 hours)

1. Assess whether exploit is active or theoretical
2. If active: follow P0 containment steps
3. If theoretical: apply fix and deploy before going public
4. Notify users only if PII was confirmed exposed

### P2 — Medium (respond within 48 hours)

1. Open a GitHub issue marked `security` (private if sensitive)
2. Apply patch in next deploy cycle
3. No user notification required unless PII confirmed exposed

### P3 — Low (respond within 2 weeks)

1. Track in backlog
2. Include in next scheduled security review

---

## 5. Key Rotation Procedure

Rotate in this order to avoid downtime:

```
1. Generate new secret (do NOT delete old one yet)
2. Update Supabase Edge Function environment variables:
   supabase secrets set KEY=new_value --project-ref eqoltjofjlznlirbalrb
3. Redeploy affected edge functions
4. Verify new secret is working (check function logs for auth errors)
5. Delete old secret / revoke old key
6. Update auth.js and _headers if the anon key changed
7. Commit and push updated files
8. Verify no errors in Supabase logs for 15 minutes
```

**Secrets inventory:**

| Secret | Where to rotate | Who else needs updating |
|--------|----------------|------------------------|
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API | Edge function env vars |
| `SUPABASE_ANON_KEY` | Supabase → Settings → API | `auth.js`, `background.js` (hardcoded), `_headers` CSP |
| `STRIPE_SECRET_KEY` | Stripe → Developers → API keys | Edge function env vars |
| `STRIPE_WEBHOOK_SECRET` | Stripe → Webhooks (delete + recreate endpoint) | `STRIPE_WEBHOOK_SECRET` env var |

---

## 6. User Notification Template

**Subject:** Important security notice — your Ace Paste account

> We are writing to inform you of a security incident that may have affected your Ace Paste Cleaner Pro account.
>
> **What happened:** [Brief, plain-language description]
>
> **What information was involved:** Your email address ([user@example.com]) may have been exposed. [Include or exclude: your subscription status.] No payment information was involved — all payment data is managed by Stripe and was not affected.
>
> **What we've done:** We have [rotated all credentials / patched the vulnerability / notified the relevant authorities] within [X hours] of discovering this issue.
>
> **What you should do:** [Change your password if applicable. Watch for phishing emails using your email address.]
>
> We apologize for this incident and take our responsibility to protect your information seriously.
>
> — ThinkWell Labs

---

## 7. Regulatory Contacts

| Regulation | Applicable if | Notify | Deadline |
|------------|--------------|--------|----------|
| GDPR | Any EU/EEA users | Lead supervisory authority (country of establishment) | 72 hours from awareness |
| CCPA | California users | Affected individuals | Expedient, maximum 30 days |
| PIPEDA | Canadian users | Affected individuals + Privacy Commissioner | As soon as feasible |

---

## 8. Post-Incident Review Checklist

- [ ] Confirmed attack vector documented
- [ ] Timeline reconstructed (detection → containment → notification)
- [ ] All credentials rotated
- [ ] Patch deployed and verified
- [ ] Evidence preserved (logs exported, screenshots saved)
- [ ] Regulatory notifications sent (if required)
- [ ] Users notified (if required)
- [ ] INCIDENT-RESPONSE.md updated if new procedures needed
- [ ] Security controls updated to prevent recurrence

---

## 9. Contact Matrix

| Role | Responsible for |
|------|----------------|
| Product owner (Axel) | P0/P1 decisions, user communications, regulatory filing |
| Supabase support | Database-layer incidents — support.supabase.com |
| Stripe support | Payment-layer incidents — support.stripe.com |
| Legal counsel | Regulatory notification review before sending |

---

*This document should be reviewed after every P0/P1 incident and no less than annually.*
