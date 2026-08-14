<script setup>
import { ref } from 'vue'
import { useTheme, useDisplay } from 'vuetify'

const props = defineProps({
  modelValue: {
    type: Boolean,
    default: false
  },
  currentPage: {
    type: String,
    default: 'curriculum'
  },
  currentCourseName: {
    type: String,
    default: 'CIC'
  }
})

const emit = defineEmits(['change-page', 'update:modelValue', 'open-turmas-modal', 'open-course-modal', 'clear-browser-data'])

const isCompact = ref(false)

const theme = useTheme()
const { mobile } = useDisplay()

const toggleTheme = () => {
  const newTheme = theme.global.current.value.dark ? 'light' : 'dark'
  theme.global.name.value = newTheme
  localStorage.setItem('theme', newTheme)
}

const selectPage = (pageName) => {
  emit('change-page', pageName)
  if (mobile.value) {
    emit('update:modelValue', false)
  }
}
</script>

<template>
  <v-navigation-drawer
    :model-value="!mobile || modelValue"
    @update:model-value="emit('update:modelValue', $event)"
    :permanent="!mobile"
    :temporary="mobile"
    :rail="!mobile && isCompact"
  >
    <v-list density="compact" nav>
      <!-- Hide collapse button on mobile -->
      <v-list-item
        v-if="!mobile"
        :prepend-icon="isCompact ? 'mdi-chevron-right' : 'mdi-chevron-left'"
        title="Ocultar Menu"
        class="mb-2"
        @click="isCompact = !isCompact"
      ></v-list-item>

      <v-divider v-if="!mobile" class="mb-2"></v-divider>

      <!-- Main Pages -->
      <v-list-item
        prepend-icon="mdi-home"
        title="Início"
        value="home"
        :active="currentPage === 'home'"
        @click="selectPage('home')"
      ></v-list-item>

      <v-list-item
        prepend-icon="mdi-sitemap"
        title="Matriz Curricular"
        value="curriculum"
        :active="currentPage === 'curriculum'"
        @click="selectPage('curriculum')"
      ></v-list-item>

      <v-list-item
        prepend-icon="mdi-calendar-clock"
        title="Gerar Grade"
        value="generate_schedules"
        :active="currentPage === 'generate_schedules' || currentPage === 'generated_schedule'"
        @click="selectPage('generate_schedules')"
      ></v-list-item>

      <v-list-item
        prepend-icon="mdi-bookmark-check"
        title="Grades Salvas"
        value="saved_schedules"
        :active="currentPage === 'saved_schedules'"
        @click="selectPage('saved_schedules')"
      ></v-list-item>

      <v-list-item
        prepend-icon="mdi-flag-checkered"
        title="Previsão de Formatura"
        value="graduation_plan"
        :active="currentPage === 'graduation_plan'"
        @click="selectPage('graduation_plan')"
      ></v-list-item>
    </v-list>

    <template v-slot:append>
      <v-divider></v-divider>
      <v-list density="compact" nav>
        <v-list-item
          v-if="mobile"
          prepend-icon="mdi-school-outline"
          :title="`Curso: ${currentCourseName}`"
          @click="emit('open-course-modal')"
        ></v-list-item>

        <v-list-item
          prepend-icon="mdi-database-clock-outline"
          title="Atualizar Turmas"
          @click="emit('open-turmas-modal')"
        ></v-list-item>

        <v-list-item
          v-if="mobile"
          prepend-icon="mdi-delete-sweep-outline"
          title="Limpar Dados"
          @click="emit('clear-browser-data')"
        ></v-list-item>

        <!-- Theme Switcher -->
        <v-list-item
          :prepend-icon="theme.global.current.value.dark ? 'mdi-weather-sunny' : 'mdi-weather-night'"
          :title="theme.global.current.value.dark ? 'Modo Claro' : 'Modo Escuro'"
          @click="toggleTheme"
        ></v-list-item>
      </v-list>
    </template>
  </v-navigation-drawer>
</template>

<style scoped>
</style>