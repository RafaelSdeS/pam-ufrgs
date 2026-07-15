# Matrícula UFRGS — Planejador de Grade e Horários

Uma aplicação web simples, rápida e que roda **100% no navegador** para ajudar estudantes da UFRGS (Ciência da Computação e Engenharia de Computação) a planejar seus semestres, verificar créditos e montar grades de horários sem conflitos.

---

## ✨ O que o sistema faz?

1. **Leitura de Histórico via PDF**
   - Você envia o arquivo do seu Histórico Escolar UFRGS (`.pdf`) e o sistema lê tudo localmente no seu navegador. Ele identifica automaticamente as disciplinas cursadas e calcula seu progresso no curso, sem enviar seus dados para nenhum servidor.

2. **Montagem e Geração de Grades Sem Conflitos**
   - Escolha as disciplinas obrigatórias e eletivas que deseja cursar no semestre.
   - Marque no calendário os **bloqueios de horário** em que você não pode ter aulas (trabalho, estágio, compromissos pessoais).
   - O sistema gera automaticamente todas as opções de grade possíveis, informando o número de **vagas** para o seu curso e o **total de créditos**.

3. **Grades Salvas & Exportação em PDF**
   - Salve suas opções favoritas para comparar depois.
   - Encontre disciplinas eletivas que encaixam perfeitamente nos horários livres da sua grade.
   - Exporte sua grade e o resumo de disciplinas com créditos diretamente para **PDF**.

---

## 📁 Estrutura do Projeto

- **`app-frontend/`**: Código do aplicativo web (construído com Vue 3, Vuetify e Vite).
- **`turmas_data/`**: Pasta onde ficam armazenadas as informações das turmas separadas por semestre.
- **`importar_turmas_data.py`** (ou `./importar_turmas.sh`): Script Python que lê os arquivos HTML salvos do Portal do Aluno e atualiza automaticamente a base de dados do aplicativo.

---

## 🔄 Como atualizar as turmas de um novo semestre?

Para atualizar as disciplinas e vagas com os dados mais recentes do Portal do Aluno da UFRGS, siga estes passos simples:

1. **Salve as páginas do Portal do Aluno:**
   - Acesse o Portal do Aluno da UFRGS e salve a página com o horário das turmas de Ciência da Computação (`cic_...html`) e de Engenharia de Computação (`ecp_...html`).
   - Coloque esses arquivos HTML dentro da pasta do semestre correspondente em `turmas_data/` (por exemplo: `turmas_data/26_2/`).

2. **Rode o script de importação:**
   ```bash
   ./importar_turmas.sh
   ```
   *Ou diretamente via Python:*
   ```bash
   python3 importar_turmas_data.py
   ```
   O script lerá os arquivos HTML, mostrará na tela o que mudou e atualizará automaticamente o arquivo `app-frontend/src/data/academic_data.json`. Os HTMLs processados serão movidos para a pasta `imported/`.

---

## 🚀 Como executar ou fazer o deploy da aplicação?

### Para rodar no seu computador (Modo de Desenvolvimento)

1. Entre na pasta do frontend:
   ```bash
   cd app-frontend
   ```
2. Instale as dependências (apenas na primeira vez):
   ```bash
   npm install
   ```
3. Inicie o servidor local:
   ```bash
   npm run dev
   ```
   Acesse a aplicação no navegador em: **`http://localhost:5173`**

---

### Para publicar em um servidor (Modo de Produção)

A nossa aplicação gera arquivos estáticos (HTML, CSS e JavaScript), o que significa que ela não precisa de um servidor Node.js ou Python rodando por trás.

1. Dentro da pasta `app-frontend`, gere a versão final otimizada:
   ```bash
   npm run build
   ```
2. A pasta **`app-frontend/dist/`** será criada com todos os arquivos prontos.
3. Copie todo o conteúdo de `dist/` para a sua hospedagem (seja uma pasta de usuário no servidor do INF/UFRGS, Apache, Nginx ou GitHub Pages).

Como o projeto está configurado para usar caminhos relativos, o site funcionará perfeitamente em qualquer pasta ou servidor, sem necessidade de configurações especiais de rede.
