<script setup>
import { useDisplay } from 'vuetify'

const emit = defineEmits(['change-page'])
const { mobile } = useDisplay()
</script>

<template>
  <div>
    <h1 class="text-h4 font-weight-bold text-primary mb-4">
      Painel Principal
    </h1>

    <v-divider class="mb-6"></v-divider>

    <v-card class="pa-4 pa-md-6" elevation="2" rounded="lg">
      <v-row align="center">
        <v-col cols="12" md="8">
          <h2 class="text-h5 mb-4">Bem-vindo ao Planejador de Matrícula UFRGS!</h2>

          <p class="text-body-1 text-medium-emphasis mb-4">
            Este é o portal auxiliar de matrícula da UFRGS para os cursos de Ciência da Computação e Engenharia de Computação. Todo o processamento do seu histórico e geração de grades ocorre localmente no seu dispositivo.
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
  </div>
</template>

<style scoped>
.gap-3 {
  gap: 12px;
}
</style>