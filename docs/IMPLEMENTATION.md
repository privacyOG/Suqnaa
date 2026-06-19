# Implementation notes

The first version is intentionally modular:

- Brand assets are replaceable.
- The API, web app, and mobile app are separated.
- PostgreSQL is the system of record.
- Redis and object storage are infrastructure services, not embedded storage.
- Trust, fairness, quality, and security are core product behaviours rather than only marketing copy.

## Immediate next tasks

1. Add real authentication tokens and refresh-session persistence.
2. Add user verification flows.
3. Add listing image upload and object storage.
4. Add category seed data.
5. Add mobile navigation and listing details.
6. Add moderation/reporting screens.
