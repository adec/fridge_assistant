# Testing on a dev Home Assistant

This workflow deploys the current working copy, including uncommitted changes,
without creating a commit, pushing a branch or publishing a release. It targets
HAOS through an SSH app with Python 3, the `ha` CLI and Supervisor API access.
For the official Terminal & SSH app, add `python3` to its `apks` option so it
is installed again after an app restart.
The SSH key must already be authorised. Keep production credentials and automations
out of this dev instance.

Copy `docs/dev-deploy.example.json` to `.dev-deploy.json`. Supply the dev hostname,
SSH user/port, production hostname(s) in `blocked_hosts`, and a unique random `identity` (for example from `python3 -c
'import uuid; print(uuid.uuid4())'`). The local target configuration is gitignored.

Once you have explicitly verified this is the dev target:

```sh
python3 scripts/deploy_dev.py --pair
```

This writes `/config/.fridge-assistant-dev`. Later deployments require that marker
to match your local identity. Hostnames listed in the local `blocked_hosts` setting are rejected; this is an
accident-prevention guard, not a replacement for server access controls.

## Deploy and test

```sh
python3 scripts/deploy_dev.py
```

The command runs the test suite, packages only `custom_components/fridge_assistant`,
compiles the uploaded Python files, backs up existing code and the integration's
storage files, replaces the integration code, restarts dev Core, and checks that
its API returns and, where the SSH app grants Core API access, all configured
Fridge Assistant entries report `loaded`. With the official Terminal & SSH app,
the token only grants Supervisor access: the check confirms Core is running and
reports that the integration runtime state still needs verification in the UI
(exit code 4). It never treats this limited check as a fully verified deployment.
It neither copies local inventory data nor changes other integrations.
The uploaded copy receives a unique dev version and import cache stamps; your
working source is unchanged. Refresh your browser after deployment.

On a fresh instance, the first deployment reports that Fridge Assistant still needs
configuring (exit code 2). Add it in **Settings → Devices & services → Add integration**,
then run:

```sh
python3 scripts/deploy_dev.py --check
```

If the check reports exit code 4, check Fridge Assistant in Devices & services
and open its panel. A future CI pipeline will need a scoped test credential or
an appropriately configured dev runner for a full API smoke test.

Create a small dev-only inventory covering counted stock, portions, opening,
thawing, month-only dates and multiple locations. Configure optional services with
dev credentials. In particular, avoid production printer or shopping-list writes.
The startup check is not a substitute for testing the feature in the UI.

## Recovery

Backups remain on dev under `/config/fridge-assistant-dev-backups/<backup-name>`.
They can include integration credentials in the stored data and should stay private.
No automatic pruning is performed. The deployment output prints the backup name.

```sh
python3 scripts/deploy_dev.py --rollback BACKUP_NAME
```

Rollback restores code and restarts dev. It deliberately leaves inventory data
unchanged: data schema migrations can make a code-only rollback insufficient.
If data recovery is required, stop Core and restore the matching storage backup
separately after reviewing what changed. The very first install has no previous
code to roll back to.

## Proposed CI/CD follow-up

Keep this manual dev deployment as the first stage. Later add pull-request checks,
an approved dev deployment stage, a smoke test and a separate release approval.
Use a dedicated deployment account or constrained runner on the dev network;
never expose a Docker socket or production SSH access to a general CI job.
Use branch/environment restrictions, serialized deployment jobs and the exact
reviewed revision. Define rollback and data-migration handling before automating it.

OpenAI Codex was used to develop this deployment tooling.
