README-deploy

Opções para publicar o repositório e implantar no Render (passos mínimos):

Requisitos locais:
- Git instalado: https://git-scm.com/
- GitHub CLI (`gh`) recomendado: https://cli.github.com/ (facilita criar repositório e push)
- Conta no GitHub e no Render

1) Criar e enviar o repositório (opção automática com `gh`)
- Abra `cmd` na pasta do projeto:
  cd "C:\Users\Asus Vivobook\Downloads\AnimeRoll"
- Execute o script automático (pode passar um nome de repo opcional):
  publish.cmd animeroll
- O script fará `git init`, `git add .`, `git commit` e usará `gh repo create` para criar o repo e enviar o código.

2) Se você não usar `gh`, faça manualmente:
  git init
  git add .
  git commit -m "Initial AnimeRoll add-on"
  git remote add origin https://github.com/<seu-usuario>/<repo>.git
  git branch -M main
  git push -u origin main

3) Deploy no Render (gratuito)
- Acesse https://render.com e crie conta (gratuita)
- Clique em New → Web Service → Connect a repository (GitHub)
- Escolha o repositório que você acabou de criar
- Branch: `main`
- Build Command: `npm install`
- Start Command: `node server.js`
- Plan: Free
- Deploy. Após o deploy, pegue a URL HTTPS e adicione ao Stremio: `https://<sua-url>/manifest.json`

Observações finais
- Se houver problemas com scraping, ajuste `addon.js` e re-push para disparar novo deploy.
- Se quiser, posso gerar um PR com melhorias no parser se você me der acesso ao repo (ou me fornecer o URL do repositório após criá-lo).
