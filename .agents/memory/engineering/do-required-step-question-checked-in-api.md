# A required step question is required in the API too

A question with `required: true` (`packages/companies/src/steps.ts`) must be required at the
API entry too, or `POST /v1/companies` creates a company without an answer. A browser is
bypassed by a request or a script, and an empty "what it does" travels into
`organization.metadata` and is cured only by editing data.

Done in `newCompanyOf` (`apps/api/src/onboarding.ts`): refusal on an empty name and an empty
description. The body is described in `companyBodySchema` (`apps/api/src/contracts.ts`), the
step in `steps.ts`.

**Check — with live requests:** `POST /v1/companies` with a name only → `400` ("company name
and description are needed"); with a description → `201`.
