# Frontend — Matrícula UFRGS

Esta pasta contém a interface web (Vue 3 + Vite + Vuetify) do planejador de grades e horários da UFRGS.

Todos os dados acadêmicos e currículos ficam armazenados na pasta `src/data/` (`academic_data.json` e `ufrgs_data.json`) e são carregados diretamente pelo navegador do usuário.

---

## 🛠️ Comandos Básicos

```bash
# Instalar as dependências do projeto
npm install

# Rodar em modo de desenvolvimento local (http://localhost:5173)
npm run dev

# Compilar para produção (gera a pasta dist/ pronta para servidores)
npm run build

# Testar localmente a versão compilada de produção
npm run preview
```

Consulte o [README principal](../README.md) na raiz do repositório para instruções completas sobre como atualizar as turmas usando os scripts Python.
