<script setup>
import { ref, computed } from 'vue'
import { dataService } from '../services/dataService'
import { curriculumService } from '../services/curriculumService'

const props = defineProps({
  modelValue: Boolean
})

const emit = defineEmits(['update:modelValue', 'turmas-updated'])

const fileInput = ref(null)
const uploadError = ref('')
const uploadSuccess = ref('')
const sourceUpdateTrigger = ref(0)
const sourceInfo = computed(() => {
  sourceUpdateTrigger.value
  return dataService.getTurmasSourceInfo(curriculumService.selectedCourseRef.value)
})
const totalTurmas = computed(() => dataService.getTurmas().length)

const readFileWithEncodingFallback = async (file) => {
  const buffer = await file.arrayBuffer()
  const utf8Decoder = new TextDecoder('utf-8', { fatal: true })
  try {
    const text = utf8Decoder.decode(buffer)
    if (!text.includes('\uFFFD')) {
      return text
    }
  } catch (e) {
    // Ignora erro fatal UTF-8 para tentar fallback
  }
  const latinDecoder = new TextDecoder('windows-1252')
  return latinDecoder.decode(buffer)
}

const onFileChange = async (event) => {
  const file = event.target.files?.[0]
  if (!file) return

  uploadError.value = ''
  uploadSuccess.value = ''

  try {
    const text = await readFileWithEncodingFallback(file)
    let parsed = []

    if (file.name.endsWith('.html') || file.name.endsWith('.htm') || text.includes('<table')) {
      parsed = dataService.parseTurmasHtml(text)
    } else {
      uploadError.value = 'Por favor, selecione um arquivo HTML (.html) salvo diretamente do Portal do Aluno.'
      return
    }

    if (!parsed || !Array.isArray(parsed) || parsed.length === 0) {
      uploadError.value = 'Arquivo inválido ou nenhuma turma identificada. Verifique se o arquivo HTML contém a tabela de turmas do Portal do Aluno.'
      return
    }

    const fileDate = file.lastModified ? new Date(file.lastModified) : new Date()
    const fileTimestamp = fileDate.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    dataService.saveCustomTurmas(parsed, fileTimestamp)
    sourceUpdateTrigger.value++
    uploadSuccess.value = `Sucesso! ${parsed.length} turmas carregadas com sucesso do arquivo ${file.name}.`
    emit('turmas-updated')
  } catch (err) {
    console.error(err)
    uploadError.value = 'Erro ao processar o arquivo. Verifique a formatação do HTML.'
  }
}

const resetToOfficial = () => {
  dataService.resetToOfficialTurmas()
  sourceUpdateTrigger.value++
  uploadSuccess.value = 'Restaurado para as turmas do servidor.'
  emit('turmas-updated')
}
</script>

<template>
  <v-dialog
    :model-value="modelValue"
    max-width="580"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <v-card class="glass-card rounded-xl pa-6" elevation="10">
      <div class="d-flex align-center justify-space-between mb-4">
        <div class="d-flex align-center ga-3">
          <v-avatar color="primary" size="44">
            <v-icon color="white">mdi-database-clock-outline</v-icon>
          </v-avatar>
          <div>
            <h3 class="text-h6 font-weight-bold mb-0">Atualização de Turmas</h3>
            <p class="text-caption text-medium-emphasis mb-0">Gerenciamento do catálogo de turmas e horários</p>
          </div>
        </div>

        <v-btn
          icon="mdi-close"
          variant="text"
          size="small"
          @click="emit('update:modelValue', false)"
        />
      </div>

      <v-card variant="outlined" class="pa-4 rounded-xl mb-4">
        <div class="text-caption text-medium-emphasis mb-1">ORIGEM ATUAL DOS DADOS</div>
        <div class="d-flex align-center justify-space-between">
          <div class="font-weight-bold text-body-1">{{ sourceInfo.label }}</div>
          <v-chip color="primary" size="small" variant="flat" class="font-weight-bold">
            {{ totalTurmas }} turmas
          </v-chip>
        </div>
      </v-card>

      <v-card variant="tonal" color="primary" class="pa-4 rounded-xl mb-4">
        <div class="text-caption font-weight-bold mb-1">COMO ATUALIZAR SUAS TURMAS:</div>
        <ul class="text-caption ps-4 mb-0">
          <li>
            <strong>Página HTML:</strong> Salve a página de Turmas Oferecidas diretamente do Portal do Aluno UFRGS no seu computador (<kbd>Ctrl + S</kbd> ou <kbd>Cmd + S</kbd>) e selecione o arquivo <code>.html</code> abaixo.
          </li>
        </ul>
      </v-card>

      <v-alert
        v-if="uploadSuccess"
        type="success"
        variant="tonal"
        closable
        rounded="lg"
        class="mb-4"
      >
        {{ uploadSuccess }}
      </v-alert>

      <v-alert
        v-if="uploadError"
        type="error"
        variant="tonal"
        closable
        rounded="lg"
        class="mb-4"
      >
        {{ uploadError }}
      </v-alert>

      <div class="d-flex flex-column ga-2">
        <v-btn
          color="primary"
          variant="flat"
          size="large"
          rounded="xl"
          prepend-icon="mdi-upload"
          block
          @click="fileInput.click()"
        >
          Carregar Arquivo HTML
        </v-btn>
        <input
          ref="fileInput"
          type="file"
          accept=".html,.htm"
          class="d-none"
          @change="onFileChange"
        />

        <v-btn
          v-if="sourceInfo.isCustom"
          color="secondary"
          variant="text"
          size="small"
          prepend-icon="mdi-refresh"
          class="mt-2"
          @click="resetToOfficial"
        >
          Voltar a usar turmas do servidor
        </v-btn>
      </div>
    </v-card>
  </v-dialog>
</template>
