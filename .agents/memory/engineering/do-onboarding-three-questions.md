# Onboarding is three questions and no model

Onboarding asks the company name, what it does and whom to invite. Answers are saved at
every step, and the company is created right after the last one. The model takes no part in
onboarding.

Matching tables by description (a model proposal, its queue, schema and display) is removed
whole. A company has no database of its own at all (see `do-company-without-a-database`).

The company list lives at its own address `/companies`; the root leads there. Onboarding is
open to everyone and creates a new company; it shows previous answers only to someone who has
no companies yet.
