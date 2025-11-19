# AnimeRoll Stremio Add-on

AnimeRoll is a simple Stremio add-on that aggregates anime content from two sources:
- https://animesdrive.blog/
- https://www.anroll.net/

This project is a minimal working add-on that scrapes the sites for recent posts and exposes them
as catalogs and metas to Stremio. Streams are provided as `externalUrl` where direct video links aren't found.

## Requirements
- Node.js (14+ recommended)

## Install
Open a terminal in the project folder and run:

```powershell
npm install
```

## Run locally (test with Stremio)
Start the add-on server:

```powershell
npm start
```

Then add the manifest URL in Stremio: `http://localhost:7000/manifest.json`.

Observação sobre IDs de catálogo:
- Os IDs dos catálogos usados por este add-on seguem o formato recomendado pelo Stremio: `animesdrive:catalog:latest` e `anroll:catalog:latest`.
- O add-on aceita também os IDs legados `animesdrive-latest` e `anroll-latest` por compatibilidade, mas use o formato com prefixo quando possível.

You can also use the Stremio CLI options supported by `stremio-addon-sdk` when installed globally.

## Notes & Limitations

## Next steps (suggested)

## Deployment (Heroku / any Node host)
1. Ensure your repo is committed and `Procfile` exists (this project includes `Procfile`).
2. Push to Heroku or other Node PaaS. Heroku will run `web: node server.js`.
3. Use an HTTPS URL to add the manifest in Stremio: `https://your-domain/manifest.json`.

## Troubleshooting local install on Windows
- If `npm install` is blocked in PowerShell due to script execution policy, run the install via `cmd` instead or change the policy (run PowerShell as Administrator and use `Set-ExecutionPolicy RemoteSigned` if you understand the implications).

Example commands (PowerShell):
```powershell
cd "C:\Users\Asus Vivobook\Downloads\AnimeRoll"
cmd /c "npm install"
npm start
```

If you prefer, I can try installing dependencies and starting the server here; let me know and I'll attempt again (I may need to run `npm install` via `cmd` to avoid PowerShell policy issues).

## Deploy to Render (recommended, gratuito)
Este repositório inclui um `render.yaml` para facilitar deploy no Render (plano gratuito). Abaixo os passos para publicar o add-on e obter uma URL HTTPS para o `manifest.json`.

1) Crie um repositório GitHub com o conteúdo deste diretório (ou conecte seu repositório existente).

```cmd
cd "C:\Users\Asus Vivobook\Downloads\AnimeRoll"
git init
git add .
git commit -m "Initial AnimeRoll addon"
git branch -M main
git remote add origin https://github.com/<seu-usuario>/animeroll.git
git push -u origin main
```

2) Crie uma conta em https://render.com (há opção gratuita). Conecte sua conta ao repositório GitHub e crie um novo Web Service:
- Selecione o repositório `animeroll`.
- Branch: `main`.
- Build Command: `npm install` (o `render.yaml` já define isso).
- Start Command: `node server.js`.
- Plano: `Free`.

3) Deploy: o Render irá instalar dependências e iniciar o serviço. Quando o deploy terminar, você terá uma URL do tipo `https://animeroll-on-<user>.onrender.com`.

4) Instale o add-on no Stremio adicionando o manifesto:
`https://<sua-url>/manifest.json`

Notas:
- O `serveHTTP` do `stremio-addon-sdk` já expõe `/manifest.json`, `/catalog`, `/meta` e `/stream` automaticamente.
- Se quiser automatizar deploys, mantenha o `render.yaml` no repositório e faça push para `main` sempre que atualizar.

Se quiser, eu posso:
- Gerar o comando `git` com seu GitHub remoto (se me passar o URL do repositório).
- Preparar um pequeno `README-deploy.md` mais enxuto para colocar no repositório.
