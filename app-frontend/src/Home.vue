<script setup>
import { useDisplay } from 'vuetify'

const emit = defineEmits(['change-page'])
const { mobile } = useDisplay()
</script>

<template>
  <div>
    <h1 class="text-h4 font-weight-bold text-primary mb-4">
      Página Auxiliar à Matrícula na UFRGS
    </h1>

    <v-divider class="mb-6"></v-divider>

    <v-card class="pa-4 pa-md-6 mb-6" elevation="2" rounded="lg">
      <v-row align="center">
        <v-col cols="12" md="10">
          <h2 class="text-h5 mb-4">Bem-vindo à PAM!</h2>

          <p class="text-body-1 text-medium-emphasis mb-4">
            Este é um portal auxiliar ao processo de matrícula de estudantes de graduação da UFRGS, no momento, restrito aos cursos de Ciência da Computação e Engenharia de Computação. Acessas agora uma página estática, tudo o que é feito é processado localmente no seu dispositivo. Não há coleta ou tratamento de dados de usuário.
          </p>

          <v-alert type="info" variant="tonal" border="start" class="mb-6">
            Acesse a <strong>Matriz Curricular</strong> para visualizar seu progresso e fazer upload do histórico, e depois utilize a seção <strong>Gerar Grade</strong> para montar sua grade letiva sem conflito de horários.
          </v-alert>

          <div class="d-flex flex-column flex-sm-row flex-wrap gap-3 w-100">
            <v-btn
              color="primary"
              :size="mobile ? 'medium' : 'large'"
              :block="mobile"
              prepend-icon="mdi-sitemap"
              class="text-none font-weight-bold"
              @click="emit('change-page', 'curriculum')"
            >
              Ver Matriz e Histórico
            </v-btn>

            <v-btn
              color="secondary"
              variant="outlined"
              :size="mobile ? 'medium' : 'large'"
              :block="mobile"
              prepend-icon="mdi-calendar-clock"
              class="text-none font-weight-bold"
              @click="emit('change-page', 'generate_schedules')"
            >
              Gerar Grade de Horários
            </v-btn>
          </div>
        </v-col>
      </v-row>
    </v-card>

    <!-- Card de Origem e Repositório -->
    <v-card class="pa-4 pa-md-6 glass-card border rounded-lg" elevation="2">
      <div class="d-flex align-center gap-3 mb-4">
        <v-avatar color="primary" variant="tonal" size="44">
          <v-icon color="primary" size="24">mdi-information-outline</v-icon>
        </v-avatar>
        <div>
          <h3 class="text-h6 font-weight-bold mb-0">Origem do Projeto e Código Aberto</h3>
          <p class="text-caption text-medium-emphasis mb-0">Sobre a PAM - UFRGS (Página Auxiliar à Matrícula)</p>
        </div>
      </div>

      <p class="text-body-1 text-medium-emphasis mb-4">
        A <strong>PAM - UFRGS</strong> nasceu para anestesiar a dor que o indivíduo que vos escreve sentia (e projetava em seus colegas) ao tentar montar uma grade de horários razoável numa virada de semestre. A opção de geração oferecida pelo portal de serviços oficial deixava a desejar em usabilidade, o que forçava alguém interessado a montar <em>manualmente</em> suas grades, tendo que alternar constantemente entre a página de turmas oferecidas e o seu editor de planilhas de preferência.
      </p>

      <p class="text-body-1 text-medium-emphasis mb-4">
        Essa dor era tamanha que eu fui capaz de convencer dois grupos de pessoas distintos a orientarem trabalhos de disciplina em torno dela. No entanto, em ambos os casos, o cerne teve de ser degenerado para atender às especificações dos trabalhos. Na disciplina que então era chamada de Técnicas de Construção de Programas, em razão da tecnologia utilizada e dificuldade de distribuição. E depois, em Engenharia de Software, em razão da complexidade mínima, que era excessiva. O primeiro destes trabalhos (<a href="https://github.com/SW-Engineering-Courses-Karina-Kohl/tcp-20252-final-grupo_07" target="_blank" rel="noopener noreferrer" class="text-primary font-weight-medium text-decoration-none">acessível aqui</a>) é um predecessor espiritual. E o segundo (<a href="https://github.com/MagnusLazuta/PMA-portal-de-matricula-auxiliar" target="_blank" rel="noopener noreferrer" class="text-primary font-weight-medium text-decoration-none">acessível aqui</a>), teve seu código usado como base para este projeto. A adaptação do trabalho de disciplina para este projeto foi feita com auxílio de LLMs.
      </p>

      <v-divider class="my-4"></v-divider>

      <div class="d-flex flex-column flex-sm-row align-start align-sm-center justify-space-between gap-3 flex-wrap">
        <div class="d-flex align-center gap-2 flex-wrap">
          <v-icon color="text-medium-emphasis">mdi-github</v-icon>
          <span class="text-body-2 font-weight-medium">Repositório deste projeto no GitHub:</span>
          <a
            href="https://github.com/vkveiga/pam-ufrgs"
            target="_blank"
            rel="noopener noreferrer"
            class="text-primary font-weight-bold text-decoration-none d-inline-flex align-center"
          >
            github.com/vkveiga/pam-ufrgs
            <v-icon size="small" class="ml-1">mdi-open-in-new</v-icon>
          </a>
        </div>

        <v-btn
          color="primary"
          variant="tonal"
          prepend-icon="mdi-github"
          href="https://github.com/vkveiga/pam-ufrgs"
          target="_blank"
          rel="noopener noreferrer"
          class="text-none font-weight-bold"
          :size="mobile ? 'small' : 'default'"
        >
          Acessar Repositório
        </v-btn>
      </div>
    </v-card>

    <!-- Card de Projetos Relacionados -->
    <v-card class="pa-4 pa-md-6 glass-card border rounded-lg" elevation="2">
      <div class="d-flex align-center gap-3 mb-4">
        <v-avatar color="secondary" variant="tonal" size="44">
          <v-icon color="secondary" size="24">mdi-link-variant</v-icon>
        </v-avatar>
        <div>
          <h3 class="text-h6 font-weight-bold mb-0">Projetos Relacionados</h3>
          <p class="text-caption text-medium-emphasis mb-0">Outras alternativas de auxílio à matrícula</p>
        </div>
      </div>

      <p class="text-body-1 text-medium-emphasis mb-4">
        Existem outros projetos similares focados em auxiliar a matrícula na UFRGS que merecem destaque, embora nenhum deles pareça ser <em>open-source</em>:
      </p>

      <ul class="text-body-1 text-medium-emphasis mb-4 ml-6">
        <li class="mb-2">
          <strong><a href="https://schedule.arthurpadilha.com/" target="_blank" rel="noopener noreferrer" class="text-primary font-weight-medium text-decoration-none">UFRGS Schedule</a></strong>: Precedeu o nosso projeto no tempo (embora não a ideia em si) e oferece uma solução para o mesmo problema.
        </li>
        <li>
          <strong><a href="https://mindles.lucina.dev/" target="_blank" rel="noopener noreferrer" class="text-primary font-weight-medium text-decoration-none">Mindles</a></strong>: Surgiu depois, mas apresenta uma execução superior em muitas partes e oferece suporte a todos os cursos da UFRGS.
        </li>
      </ul>
    </v-card>
  </div>
</template>

<style scoped>
.gap-3 {
  gap: 12px;
}
</style>
