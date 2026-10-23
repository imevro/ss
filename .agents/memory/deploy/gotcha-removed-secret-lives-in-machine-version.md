# A removed secret stays in the Fly machine version

`fly secrets unset` removes a secret from the list but not from the version of an
already created machine: the old value stays in its environment, and the application keeps
reading it. Only destroying the machine and creating a new one removes it.
`machine update --env` sets a version variable but does not remove the old one.

Danger: a revoked key is considered revoked, while the process lives with the old string.

**Check** inside the machine, not in the secret list:

```sh
fly ssh console -a <app> -C printenv | grep -c '^SECRET_NAME='
```

`0` means the secret is gone; a line present means the machine version holds it. The order
of clearing: `fly machine destroy`, then `fly deploy`.
