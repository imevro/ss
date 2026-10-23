# Companies, members and invitations are run by the organization plugin

A company is a `better-auth` organization (`organization`), not a table of ours. The
`better-auth/plugins/organization` plugin holds the `organization`, `member`, `invitation`
tables, puts the active company into the session (`activeOrganizationId`) and knows the
`owner`, `admin`, `member` roles. We keep no second description of the same entity: our
tables are renamed to its names (`companies` → `organization`, `memberships` → `member`,
`invites` → `invitation`), record numbers stay ours (`comp_`, `memb_`, `inv_`), the data
stays in place.

What lives where:

| Ours | Plugin | Created by |
|---|---|---|
| company and owner creation | `createOrganization` | one action: half a company without an owner is not needed |
| invitation by address | `createInvitation` | the plugin counts the deadline and repeats |
| membership | `member` table | we read it ourselves: the person's company list is a query on `member` |
| roles | `member.role` field | `owner`/`admin`/`member`; access rules are its, not ours |

Our fields on top of the plugin that cannot be removed: `organization.status` (the company
state is given to the client) and `member.status` (the person's company list takes only
working memberships by it). The plugin does not know them and does not write them — defaults
apply.

The accepted table proposal travels in `organization.metadata` — a plugin field.
