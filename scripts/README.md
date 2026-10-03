# scripts/

`package.json` references `scripts/wait-for-ml.ps1` in the `wait-ml` script.

If that file already exists in your repository, keep it.

If it does not exist, you can either:
- create it, or
- delete the `wait-ml` script from `package.json` (it is optional).

Minimum behavior it must provide: poll `http://localhost:5000/health`
until it returns 200, with a timeout, so that `npm run ml-health` can be
called immediately after starting the ML service.