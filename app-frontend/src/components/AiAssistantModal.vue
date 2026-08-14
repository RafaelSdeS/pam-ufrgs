<script setup>
import { ref } from 'vue'
import { aiAssistantService } from '../services/aiAssistantService'

defineProps({
  modelValue: Boolean
})

const emit = defineEmits(['update:modelValue'])

const question = ref('')
const answer = ref('')
const errorMsg = ref('')
const loading = ref(false)
const rateLimitedUntil = ref(0)
const rateLimitSecondsLeft = ref(0)
let rateLimitTimer = null

const startRateLimitCountdown = (seconds) => {
  clearInterval(rateLimitTimer)
  rateLimitedUntil.value = Date.now() + seconds * 1000
  rateLimitSecondsLeft.value = seconds
  rateLimitTimer = setInterval(() => {
    rateLimitSecondsLeft.value = Math.max(0, Math.ceil((rateLimitedUntil.value - Date.now()) / 1000))
    if (rateLimitSecondsLeft.value <= 0) clearInterval(rateLimitTimer)
  }, 1000)
}

const ask = async () => {
  if (!question.value.trim() || loading.value || rateLimitSecondsLeft.value > 0) return
  loading.value = true
  errorMsg.value = ''
  answer.value = ''
  try {
    answer.value = await aiAssistantService.askAssistant(question.value.trim())
  } catch (err) {
    if (err.isRateLimit) {
      startRateLimitCountdown(err.retryAfterSeconds)
    } else {
      errorMsg.value = err.message || 'Erro ao consultar o assistente.'
    }
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <v-dialog
    :model-value="modelValue"
    max-width="620"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <v-card class="glass-card rounded-xl pa-6" elevation="10">
      <div class="d-flex align-center justify-space-between mb-4">
        <div class="d-flex align-center ga-3">
          <v-avatar color="primary" size="44">
            <v-icon color="white">mdi-robot-outline</v-icon>
          </v-avatar>
          <div>
            <h3 class="text-h6 font-weight-bold mb-0">Assistente IA</h3>
            <p class="text-caption text-medium-emphasis mb-0">Tire dúvidas sobre disciplinas e seu cronograma</p>
          </div>
        </div>

        <v-btn
          icon="mdi-close"
          variant="text"
          size="small"
          @click="emit('update:modelValue', false)"
        />
      </div>

      <v-textarea
        v-model="question"
        label="Sua pergunta"
        placeholder="Ex: quais pré-requisitos me faltam pra cursar Sistemas Operacionais I?"
        variant="outlined"
        rounded="lg"
        rows="3"
        auto-grow
        :disabled="loading"
        @keydown.enter.ctrl="ask"
      />

      <v-btn
        color="primary"
        variant="flat"
        size="large"
        rounded="xl"
        :prepend-icon="rateLimitSecondsLeft > 0 ? 'mdi-clock-outline' : 'mdi-send'"
        block
        :loading="loading"
        :disabled="!question.trim() || rateLimitSecondsLeft > 0"
        @click="ask"
      >
        {{ rateLimitSecondsLeft > 0 ? `Aguarde ${rateLimitSecondsLeft}s...` : 'Perguntar' }}
      </v-btn>

      <v-alert
        v-if="rateLimitSecondsLeft > 0"
        type="warning"
        variant="tonal"
        rounded="lg"
        icon="mdi-clock-alert-outline"
        class="mt-4"
      >
        Limite de perguntas gratuitas atingido no momento. Tente novamente em {{ rateLimitSecondsLeft }} segundo{{ rateLimitSecondsLeft === 1 ? '' : 's' }}.
      </v-alert>

      <v-alert
        v-else-if="errorMsg"
        type="error"
        variant="tonal"
        rounded="lg"
        class="mt-4"
      >
        {{ errorMsg }}
      </v-alert>

      <v-card
        v-if="answer"
        variant="tonal"
        color="primary"
        class="pa-4 rounded-xl mt-4"
        style="white-space: pre-wrap;"
      >
        {{ answer }}
      </v-card>
    </v-card>
  </v-dialog>
</template>
