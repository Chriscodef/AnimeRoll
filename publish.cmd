@echo off
REM AnimeRoll publish helper (Windows)
REM Usage: Double-click or run from project folder. Requires Git and GitHub CLI (`gh`) installed and authenticated.
REM Optionally pass a repo name as argument: publish.cmd my-animeroll-repo








































pauseecho Next: go to https://render.com, create a new Web Service, connect the GitHub repo and deploy (start command: node server.js).echo Repository created and pushed successfully.)  exit /b 1  echo gh failed to create/push repo. Check authentication with `gh auth status` and try again.
nif %errorlevel% neq 0 ()  gh repo create %REPO_NAME% --public --source=. --remote=origin --push  echo Creating repo %REPO_NAME% under your account and pushing...) else (  gh repo create --public --source=. --remote=origin --push  echo Creating repo using: gh repo create --public --source=. --remote=origin --push  echo No repository name provided to gh; gh will create under your account and ask interactively.
:: Repo name argument handling
nset REPO_NAME=%1
nif "%REPO_NAME%"=="" ()
ngit add .
ngit commit -m "Initial AnimeRoll add-on" 2>nul || echo "No changes to commit or commit skipped."  git initif %errorlevel% neq 0 (
:: Prepare local repo and commit
ngit rev-parse --is-inside-work-tree >nul 2>&1)  exit /b 1  echo   git push -u origin main  echo   git branch -M main  echo   git remote add origin https://github.com/<your-user>/<repo>.git  echo   git commit -m "Initial AnimeRoll add-on"  echo   git add .  echo   git init  echo To create repo manually, run these commands after creating a repo on GitHub:  echo.  echo GitHub CLI (gh) not found. You can install it from https://cli.github.com/ or create a repo manually on GitHub.if %errorlevel% neq 0 (where gh >nul 2>&1
:: Check for gh)  exit /b 1  echo Git not found. Install Git from https://git-scm.com/ and try again.if %errorlevel% neq 0 (where git >nul 2>&1:: Check for Git