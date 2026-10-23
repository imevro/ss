# Organization fields match the plugin by name

The `organization` plugin finds its schema in our table object by NAMES: the table name
(`organization`, `member`, `invitation`) and the field names must be its own
(`organizationId`, `userId`, `createdAt`, `inviterId`). The column name in the database is
free — it is set by the first argument (`text('organization_id')`).

It follows that:

- a table or field cannot be renamed "our way" — the plugin stops seeing the data;
- an organization has NO `updatedAt` field (in 1.7.7), and a membership has no `status` —
  extra fields are allowed only if optional or with a default, otherwise the plugin's insert
  falls over;
- `organization.metadata` is declared as a string, and the adapter makes a JSON string of the
  value itself. Our `jsonb` column cannot go there: the value would be encoded twice. The
  column is textual, we read `JSON.parse`.

A mismatch is visible at once: a read through the plugin throws a schema mismatch, and
`drizzle-kit push` prints the changes.
