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
- `GET /api/crime/sex-offenders/markers?metro=` — optional `pinsOnly=1` (metros only)
- `GET /api/crime/sex-offenders/nearby?lat=&lon=&radiusMiles=` — pack-only radius filter + coverage
- `GET /api/crime/sex-offenders/coverage?lat=&lon=` — near any pack metro centroid?
- `GET /api/crime/sex-offenders/:id`
- `GET /api/crime/sex-offenders/status`

Coverage: user is covered when within `seedRadius + 15` miles of **any** metro in
`offenders-pack.json` → `metros[]` (every seeded/represented city with coordinates).
