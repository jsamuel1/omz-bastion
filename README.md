# Dev Workflow Bastion

This package will deploy bastions for an environment based on the config in `cdk.json`.

Call with cdk context to choose between environments in the config.

Each bastion will be pre-deployed with the dot-files bootstrap, defaulting to [dot-files](https://github.com/jsamuel1/dot-files/).

After completion, you can either use session-manager to connect to the instance, or use ssh w/ session-manager's proxy-command, using the EC2 ssh key specified in `cdk.json` (or named `id_ed25519` as default)

## Implementation details

As the ssm-user does not get created until first session-manager connection, the cloud-init is configured to invoke a lambda on first boot, to initialize the `ssm-user` and install the dot-files configuration for the user.
`nohup` is used to ensure the command can complete.

## Further implementation details

See [this youtube clip](https://youtu.be/OTfYFl3rzjg?si=t3dd2WpGeeIz-fxa) for my inspiration for this project.

## Useful commands

* `npm run build`         compile typescript to js
* `npx cdk deploy --all`  deploy this stack to your default AWS account/region
* `npx cdk diff`          compare deployed stack with current state
* `npx cdk destroy --all` destroy the stack
