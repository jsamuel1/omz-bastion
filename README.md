# Dev Workflow Bastion

This package will deploy bastions for an environment based on the config in `cdk.json`.

Call with cdk context to choose between environments in the config.

Each bastion will be pre-deployed with the dot-files bootstrap, defaulting to [dot-files](https://github.com/jsamuel1/dot-files/).

After completion, you can either use session-manager to connect to the instance, or use ssh w/ session-manager's proxy-command, using the EC2 ssh key specified in `cdk.json` (or named `id_ed25519` as default)

## Implementation details

As the ssm-user does not get created until first session-manager connection, the cloud-init is configured to invoke a lambda on first boot, to initialize the `ssm-user` and install the dot-files configuration for the user.
`nohup` is used to ensure the command can complete.

## Configuring ssh for session manager

Follow the latest instructions on the AWS documentation page, or just try adding the below snipped to the bottom of your ~/.ssh/config file:

```markdown
# SSH over Session Manager
Host i-* mi-*
  ProxyCommand sh -c "aws ssm start-session --target %h --document-name AWS-StartSSHSession --parameters 'portNumber=%p'"
  User ssm-user
  ForwardAgent yes
  StrictHostKeyChecking accept-new
```

## Further implementation details

See [this youtube clip](https://youtu.be/OTfYFl3rzjg?si=t3dd2WpGeeIz-fxa) for my inspiration for this project.

## Useful commands

* `npm run build`         compile typescript to js
* `npx cdk deploy --all`  deploy this stack to your default AWS account/region
* `npx cdk diff`          compare deployed stack with current state
* `npx cdk destroy --all` destroy the stack
