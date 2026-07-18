# PAM - UFRGS (Página Auxiliar à Matrícula)

Este é um portal auxiliar ao processo de matrícula de estudantes de graduação da UFRGS, no momento, restrito aos cursos de Ciência da Computação e Engenharia de Computação. Acessas agora uma página estática, tudo o que é feito é processado localmente no seu dispositivo. Não há coleta ou tratamento de dados de usuário.

A **PAM - UFRGS** nasceu para anestesiar a dor que o indivíduo que vos escreve sentia (e projetava em seus colegas) ao tentar montar uma grade de horários razoável numa virada de semestre. A opção de geração oferecida pelo portal de serviços oficial tem uma usabilidade tenebrosa, isso forçava alguém interessado a montar *manualmente* suas grades, tendo que alternar constantemente entre a página de turmas oferecidas e o seu editor de planilhas de preferência. Deplorável.

Essa dor era tamanha que eu fui capaz de convencer dois grupos de pessoas distintos a orientarem trabalhos de disciplina em torno dela. No entanto, em ambos os casos, o cerne teve de ser degenerado para atender às especificações dos trabalhos. Na disciplina que então era chamada de Técnicas de Construção de Programas, em razão da tecnologia utilizada e dificuldade de distribuição. E depois, em Engenharia de Software, em razão da complexidade mínima, que era excessiva. O primeiro destes trabalhos ([acessível aqui](https://github.com/SW-Engineering-Courses-Karina-Kohl/tcp-20252-final-grupo_07)) é um predecessor espiritual. E o segundo ([acessível aqui](https://github.com/MagnusLazuta/PMA-portal-de-matricula-auxiliar)), teve seu código usado como base para este projeto. A adaptação do trabalho de disciplina para este projeto foi feita com auxílio de LLMs.

---

## Estrutura do Projeto

- `app-frontend/`: Código do aplicativo web.
- `turmas_data/`: Pasta onde ficam armazenadas as informações das turmas separadas por semestre.
- `importar_turmas_data.py`: Script Python que lê os arquivos HTML salvos do Portal do Aluno e atualiza a base de dados do aplicativo.

---

## Como atualizar as turmas de um novo semestre

Para atualizar as disciplinas e vagas com os dados do Portal do Aluno da UFRGS, siga estes passos:

1. Salve as páginas do Portal do Aluno:
   - Acesse o Portal do Aluno da UFRGS e salve a página com o horário das turmas de Ciência da Computação (`cic_...html`) e de Engenharia de Computação (`ecp_...html`).
   - Coloque esses arquivos HTML dentro da pasta do semestre correspondente em `turmas_data/` (por exemplo: `turmas_data/26_2/`).

2. Rode o script de importação:
   ```bash
   ./importar_turmas.sh
   ```
   Ou diretamente via Python:
   ```bash
   python3 importar_turmas_data.py
   ```
   O script lerá os arquivos HTML, mostrará na tela o que mudou e atualizará o arquivo `app-frontend/src/data/academic_data.json`. Os HTMLs processados serão movidos para a pasta `imported/`.

---

## Como executar ou fazer o deploy da aplicação

### Para rodar no seu computador

1. Entre na pasta do frontend:
   ```bash
   cd app-frontend
   ```
2. Instale as dependências:
   ```bash
   npm install
   ```
3. Inicie o servidor local:
   ```bash
   npm run dev
   ```
   Acesse a aplicação no navegador em: `http://localhost:5173`

### Para publicar em um servidor

A nossa aplicação gera arquivos estáticos (HTML, CSS e JavaScript), não precisando de servidor por trás.

1. Dentro da pasta `app-frontend`, gere a versão final:
   ```bash
   npm run build
   ```
2. A pasta `app-frontend/dist/` será criada com todos os arquivos prontos.
3. Copie todo o conteúdo de `dist/` para a sua hospedagem.
