# Sex offender pack (CommunityGuardAPI)

Static cache for the Crime → **Offenders** tab.

- **Do not** call CommunityGuard from the browser or request handlers.
- Seed once (costs ~1 call per metro, free tier = 100/month):

```bash
cd situational-awareness-api
# set COMMUNITYGUARD_API_KEY in .env
npm run seed:sex-offenders
```

- Output: `offenders-pack.json` (unique records + metro metadata).
- Optional per-id enrichments: `details/*.json` (written only by explicit detail scripts / future admin tools).

API:
- `GET /api/crime/sex-offenders/markers?metro=`
- `GET /api/crime/sex-offenders/:id`
- `GET /api/crime/sex-offenders/status`
