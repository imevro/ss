# What a gentic box needs to install skills from the MIC repository

A gentic box can install skill sets from the private `mic` repository itself, but only
when three things are present. Without them the installer falls over, and the agent tells
the person that "the program is gone".

1. **A git address substitution.** The installer does its own `git clone` over a public
   address and does not read the environment. The key therefore lives in the git settings
   as an address substitution:
   `url.https://x-access-token:<key>@github.com/meteredintelligence/.insteadOf`.
2. **A repository key.** A thin key for `meteredintelligence/mic`, code read only. It
   lives in the box settings (`MIC_GIT_TOKEN`) and in `/data/.gitconfig`.
3. **A package registry key.** The program itself lives in a private registry; the old key
   shape with the single "read packages" right is needed, written into `/data/.npmrc`.

The service key (`mic auth --name <box>`) is issued by the box itself: no human is needed
for that.

Order: take the box settings into work (`fly machine update … --env MIC_GIT_TOKEN=…`), then
the address substitution, the registry key, the skill install and the service key issue.

The check is the real install command on the box: `search`, `scrape`, `ocr`,
`speech-to-text` must appear in the skill list, and search must return a result.
