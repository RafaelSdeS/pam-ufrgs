<template>
  <v-container>
    <v-card class="mx-auto rounded-xl border-thin shadow-premium" elevation="1">
      <v-card-title class="text-h4 font-weight-bold pa-6 d-flex align-center ga-3">
        <v-icon icon="mdi-format-list-checks" color="primary" size="x-large"></v-icon>
        Escolha suas disciplinas
      </v-card-title>

      <v-card-text>
        <v-alert
          v-if="showPreviewBanner"
          type="info"
          variant="tonal"
          closable
          class="mb-4"
          @click:close="restoreDesiredCourses"
        >
          Você está vendo um preview de horário de um semestre futuro da Previsão de Formatura - sua lista de disciplinas desejadas foi trocada temporariamente.
          <v-btn size="small" variant="text" color="primary" class="text-none ml-2" @click="restoreDesiredCourses">Restaurar minha lista</v-btn>
        </v-alert>

        <!-- Semester selector on top -->
        <v-row class="mb-4">
          <v-col cols="12" md="6">
            <v-select
              v-model="selectedSemester"
              :items="semestersList"
              label="Selecione o Semestre Letivo"
              variant="outlined"
              placeholder="Selecione o semestre..."
              hide-details
            ></v-select>
          </v-col>
        </v-row>

        <v-divider class="mb-6"></v-divider>

        <div v-if="selectedSemester" class="d-flex flex-column ga-4">
          <!-- Abas para Escolha de Disciplinas -->
          <v-tabs
            v-model="courseSelectionTab"
            color="primary"
            density="compact"
            class="mb-3 border-b"
          >
            <v-tab value="eligible" class="text-none font-weight-bold px-2 px-sm-4">
              <v-icon start>mdi-check-decagram-outline</v-icon>
              <span v-if="!mobile">Disponíveis para Cursar (Vide Histórico)</span>
              <span v-else>Disponíveis</span>
              <v-chip size="x-small" color="primary" class="ml-2 font-weight-bold">
                {{ courseSelectionTab === 'eligible' ? filteredCourses.length : eligibleCoursesList.length }}
              </v-chip>
            </v-tab>
            <v-tab value="all" class="text-none font-weight-bold px-2 px-sm-4">
              <v-icon start>mdi-view-list</v-icon>
              <span v-if="!mobile">Todas as Disciplinas Oferecidas</span>
              <span v-else>Todas</span>
            </v-tab>
          </v-tabs>

          <!-- Barra de Busca Rápida -->
          <v-row>
            <v-col cols="12" md="7">
              <v-autocomplete
                :items="filteredCourses"
                item-title="name"
                return-object
                :custom-filter="customCourseFilter"
                :label="courseSelectionTab === 'eligible' ? 'Busque e clique para adicionar/remover elegível...' : 'Busque e clique para adicionar/remover disciplina...'"
                variant="outlined"
                placeholder="Digite para buscar..."
                hide-details
                @update:model-value="val => { if (val) { toggleCourseSelection(val); } }"
              ></v-autocomplete>
            </v-col>
          </v-row>

          <!-- Seções Recolhíveis de Disciplinas Obrigatórias e Eletivas -->
          <v-expansion-panels variant="accordion" multiple v-model="expandedPanels" class="mt-5">
            <!-- 1. Disciplinas Obrigatórias da Matriz -->
            <v-expansion-panel value="0" class="border rounded-lg mb-3 overflow-hidden">
              <v-expansion-panel-title class="py-3">
                <div class="d-flex align-center ga-2">
                  <v-icon color="primary" icon="mdi-book-open-page-variant"></v-icon>
                  <span class="text-subtitle-1 font-weight-bold">Disciplinas Obrigatórias da Matriz Curricular</span>
                  <v-chip size="small" color="primary" variant="tonal">{{ filteredCurriculumCourses.length }}</v-chip>
                </div>
              </v-expansion-panel-title>
              <v-expansion-panel-text class="pt-2 pb-4">
                <div class="text-caption text-medium-emphasis mb-4">
                  Clique para selecionar ou remover disciplinas obrigatórias do seu curso. As disciplinas estão organizadas e agrupadas por semestre da matriz curricular:
                </div>

                <div v-if="groupedCurriculumCourses.length > 0" class="d-flex flex-column ga-4">
                  <div
                    v-for="group in groupedCurriculumCourses"
                    :key="group.semester"
                    class="mb-2"
                  >
                    <!-- Headerzinho do Semestre -->
                    <div class="d-flex align-center ga-2 mb-3">
                      <v-icon icon="mdi-bookmark-outline" size="small" color="primary"></v-icon>
                      <span class="font-weight-bold text-subtitle-2 text-primary text-no-wrap flex-shrink-0" style="white-space: nowrap !important;">{{ group.title }}</span>
                      <v-divider class="ml-2 flex-grow-1 border-thin"></v-divider>
                    </div>

                    <!-- Chips das disciplinas daquele semestre -->
                    <div class="d-flex flex-wrap ga-2 pl-1">
                      <v-chip
                        v-for="course in group.courses"
                        :key="course.id || course.code"
                        :color="isCourseSelected(course) ? 'success' : 'primary'"
                        :variant="isCourseSelected(course) ? 'elevated' : 'outlined'"
                        :prepend-icon="isCourseSelected(course) ? 'mdi-check-circle' : 'mdi-plus-circle-outline'"
                        class="font-weight-medium px-3 py-4 cursor-pointer"
                        @click="toggleCourseSelection(course)"
                      >
                        {{ course.name }}
                        <v-icon
                          v-if="dataService.getCourseObservation(course.code || course.id)"
                          size="small"
                          color="warning"
                          class="ml-1"
                          @click.stop
                        >
                          mdi-information-outline
                          <v-tooltip activator="parent" location="top" max-width="450">
                            <div class="text-caption font-weight-regular" style="white-space: pre-line;">{{ dataService.getCourseObservation(course.code || course.id) }}</div>
                          </v-tooltip>
                        </v-icon>
                        <v-tooltip v-if="dataService.getCourseObservation(course.code || course.id)" activator="parent" location="top" max-width="450">
                          <div class="text-caption font-weight-regular" style="white-space: pre-line;">{{ dataService.getCourseObservation(course.code || course.id) }}</div>
                        </v-tooltip>
                      </v-chip>
                    </div>
                  </div>
                </div>

                <span v-if="filteredCurriculumCourses.length === 0" class="text-caption text-medium-emphasis">
                  Nenhuma disciplina obrigatória encontrada para este filtro.
                </span>
              </v-expansion-panel-text>
            </v-expansion-panel>

            <!-- 2. Disciplinas Eletivas e Complementares -->
            <v-expansion-panel v-if="filteredElectiveCourses.length > 0" value="1" class="border rounded-lg overflow-hidden">
              <v-expansion-panel-title class="py-3">
                <div class="d-flex align-center ga-2">
                  <v-icon color="warning" icon="mdi-star-outline"></v-icon>
                  <span class="text-subtitle-1 font-weight-bold">Disciplinas Eletivas e Complementares Oferecidas</span>
                  <v-chip size="small" color="warning" variant="tonal">{{ filteredElectiveCourses.length }}</v-chip>
                </div>
              </v-expansion-panel-title>
              <v-expansion-panel-text class="pt-2 pb-4">
                <div class="text-caption text-medium-emphasis mb-3">
                  Disciplinas extras ou eletivas oferecidas no semestre 2026/2 que estão fora da matriz obrigatória:
                </div>
                <div class="d-flex flex-wrap ga-2">
                  <v-chip
                    v-for="course in filteredElectiveCourses"
                    :key="course.id || course.code"
                    :color="isCourseSelected(course) ? 'success' : 'warning'"
                    :variant="isCourseSelected(course) ? 'elevated' : 'outlined'"
                    :prepend-icon="isCourseSelected(course) ? 'mdi-check-circle' : 'mdi-plus-circle-outline'"
                    class="font-weight-medium px-3 py-4 cursor-pointer"
                    @click="toggleCourseSelection(course)"
                  >
                    {{ course.name }}
                    <v-icon
                      v-if="dataService.getCourseObservation(course.code || course.id)"
                      size="small"
                      color="warning"
                      class="ml-1"
                      @click.stop
                    >
                      mdi-information-outline
                      <v-tooltip activator="parent" location="top" max-width="450">
                        <div class="text-caption font-weight-regular" style="white-space: pre-line;">{{ dataService.getCourseObservation(course.code || course.id) }}</div>
                      </v-tooltip>
                    </v-icon>
                    <v-tooltip v-if="dataService.getCourseObservation(course.code || course.id)" activator="parent" location="top" max-width="450">
                      <div class="text-caption font-weight-regular" style="white-space: pre-line;">{{ dataService.getCourseObservation(course.code || course.id) }}</div>
                    </v-tooltip>
                  </v-chip>
                </div>
              </v-expansion-panel-text>
            </v-expansion-panel>
          </v-expansion-panels>
        </div>

        <v-divider class="my-6"></v-divider>

        <div v-if="interestList.length > 0" class="mt-4">
          <v-card variant="tonal" color="success" class="pa-4 rounded-xl d-flex align-center justify-space-between flex-wrap ga-3">
            <div class="d-flex align-center ga-2 flex-wrap">
              <span class="font-weight-bold text-subtitle-2 d-flex align-center">
                <v-icon icon="mdi-check-circle" class="mr-1"></v-icon>
                {{ interestList.length }} disciplina(s) selecionada(s) ({{ dataService.getScheduleTotalCredits(interestList.map(item => item.course?.code)) }} créditos):
              </span>
              <v-chip
                v-for="(item, index) in interestList"
                :key="index"
                size="small"
                color="success"
                variant="flat"
                closable
                class="font-weight-medium cursor-pointer"
                @click="openEditDialog(item)"
                @click:close="removeFromList(index)"
              >
                {{ item.course?.code }} - {{ item.course?.name }}
                <v-icon
                  v-if="dataService.getCourseObservation(item.course?.code || item.course?.id)"
                  size="small"
                  color="warning"
                  class="ml-1"
                  @click.stop
                >
                  mdi-information-outline
                  <v-tooltip activator="parent" location="top" max-width="450">
                    <div class="text-caption font-weight-regular" style="white-space: pre-line;">{{ dataService.getCourseObservation(item.course?.code || item.course?.id) }}</div>
                  </v-tooltip>
                </v-icon>
                <v-tooltip activator="parent" location="top" max-width="450">
                  <div class="text-caption font-weight-regular" style="white-space: pre-line;">
                    Clique para editar prioridade e professores
                    <template v-if="dataService.getCourseObservation(item.course?.code || item.course?.id)">
                      <br><br><strong>Observações:</strong><br>{{ dataService.getCourseObservation(item.course?.code || item.course?.id) }}
                    </template>
                  </div>
                </v-tooltip>
              </v-chip>
            </div>
          </v-card>
        </div>
        
        <v-alert
          v-else
          type="info"
          variant="tonal"
          class="mt-4 rounded-xl text-body-2"
        >
          Sua lista está vazia. Adicione disciplinas ou clique nas opções acima para montar sua grade.
        </v-alert>
      </v-card-text>
    </v-card>

    <v-expansion-panels class="mt-6 border rounded-xl overflow-hidden">
      <v-expansion-panel value="time_blocks">
        <v-expansion-panel-title class="py-4">
          <div class="d-flex align-center justify-space-between w-100 pr-3 flex-wrap ga-2">
            <div class="d-flex align-center ga-2">
              <v-icon icon="mdi-calendar-remove" color="error" size="large"></v-icon>
              <span class="text-h6 font-weight-bold">Bloqueios de Horário (Calendário Semanal)</span>
            </div>
            <v-chip v-if="timeRestrictionsOnly.length > 0" size="small" color="error" variant="tonal" class="font-weight-bold">
              {{ timeRestrictionsOnly.length }} bloqueio(s) ativo(s)
            </v-chip>
          </div>
        </v-expansion-panel-title>

        <v-expansion-panel-text class="px-3 pb-6 pt-2">
          <div class="text-body-2 text-medium-emphasis mb-4">
            Clique diretamente nas faixas de horário da grade abaixo para indicar quando você <strong>NÃO pode ter aulas</strong> (ex: trabalho, estágio ou outros compromissos). O gerador de grades evitará selecionar turmas que colidam com estes horários.
          </div>

          <!-- Seletor e Grade Semanal para Mobile -->
          <div v-if="mobile" class="mb-6">
            <div class="text-caption font-weight-bold text-primary mb-2">Selecione o dia para alternar os bloqueios:</div>
            <v-chip-group v-model="mobileBlockDay" color="error" mandatory class="mb-4">
              <v-chip v-for="day in weeklyCalendarDays" :key="day" :value="day" variant="outlined" filter class="font-weight-bold">
                {{ day.split('-')[0] }}
              </v-chip>
            </v-chip-group>

            <div class="d-flex flex-column ga-2">
              <v-card
                v-for="slot in weeklyTimeSlots"
                :key="slot.start"
                variant="outlined"
                :color="isSlotBlocked(mobileBlockDay, slot) ? 'error' : 'default'"
                class="pa-3 rounded-lg d-flex align-center justify-space-between cursor-pointer"
                :class="{ 'bg-error-suttle': isSlotBlocked(mobileBlockDay, slot) }"
                @click="toggleSlotBlock(mobileBlockDay, slot)"
              >
                <div>
                  <div class="font-weight-bold text-body-2">{{ slot.start.slice(0,5) }} - {{ slot.end.slice(0,5) }}</div>
                  <div class="text-caption text-medium-emphasis">{{ slot.label.split('(')[1]?.replace(')', '') || slot.label }}</div>
                </div>
                <v-chip size="small" :color="isSlotBlocked(mobileBlockDay, slot) ? 'error' : 'success'" variant="flat" class="font-weight-bold">
                  <v-icon :icon="isSlotBlocked(mobileBlockDay, slot) ? 'mdi-cancel' : 'mdi-check'" start></v-icon>
                  {{ isSlotBlocked(mobileBlockDay, slot) ? 'Bloqueado' : 'Livre' }}
                </v-chip>
              </v-card>
            </div>
          </div>

          <!-- Grade Semanal de Bloqueios (Desktop) -->
          <div v-else class="overflow-x-auto mb-6">
            <v-table class="border rounded-xl text-center" density="comfortable">
              <thead>
                <tr class="bg-surface-light">
                  <th class="text-center font-weight-bold" style="min-width: 140px;">Horário / Dia</th>
                  <th
                    v-for="day in weeklyCalendarDays"
                    :key="day"
                    class="text-center font-weight-bold"
                    style="min-width: 125px;"
                  >
                    {{ day }}
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="slot in weeklyTimeSlots" :key="slot.start">
                  <td class="font-weight-bold text-caption bg-surface-light border-right">{{ slot.start.slice(0,5) }} - {{ slot.end.slice(0,5) }}</td>
                  <td
                    v-for="day in weeklyCalendarDays"
                    :key="day + slot.start"
                    class="time-cell cursor-pointer"
                    :class="{ 'blocked-cell': isSlotBlocked(day, slot) }"
                    @click="toggleSlotBlock(day, slot)"
                  >
                    <v-icon
                      v-if="isSlotBlocked(day, slot)"
                      icon="mdi-cancel"
                      color="error"
                      size="small"
                    ></v-icon>
                  </td>
                </tr>
              </tbody>
            </v-table>
          </div>

          <!-- Ações rápidas da grade -->
          <div class="d-flex justify-space-between align-center flex-wrap ga-2 mb-6">
            <div class="text-caption text-medium-emphasis">
              Dica: Você também pode adicionar faixas de horário exatas ou regras personalizadas abaixo.
            </div>
            <v-btn
              v-if="timeRestrictionsOnly.length > 0"
              color="error"
              variant="tonal"
              size="small"
              prepend-icon="mdi-trash-can-outline"
              class="font-weight-bold"
              @click="clearAllTimeRestrictions"
            >
              Limpar Todos os Bloqueios
            </v-btn>
          </div>

          <!-- Bloqueios Personalizados e Específicos -->
          <v-expansion-panels variant="accordion" class="border rounded-xl">
            <v-expansion-panel>
              <v-expansion-panel-title class="font-weight-bold text-body-2">
                <v-icon icon="mdi-clock-plus-outline" class="mr-2" color="primary"></v-icon>
                Adicionar Bloqueio Personalizado (Horários fracionados ou específicos)
              </v-expansion-panel-title>
              <v-expansion-panel-text class="pt-4">
                <v-form @submit.prevent="addCustomRestriction">
                  <v-row density="compact">
                    <v-col cols="12" sm="4">
                      <v-select
                        v-model="customForm.day"
                        :items="weeklyCalendarDays"
                        label="Dia da Semana"
                        variant="outlined"
                        density="compact"
                        hide-details="auto"
                      ></v-select>
                    </v-col>
                    <v-col cols="6" sm="4">
                      <v-text-field
                        v-model="customForm.start"
                        label="Início (HH:mm)"
                        placeholder="08:30"
                        variant="outlined"
                        density="compact"
                        hide-details="auto"
                      ></v-text-field>
                    </v-col>
                    <v-col cols="6" sm="4">
                      <v-text-field
                        v-model="customForm.end"
                        label="Fim (HH:mm)"
                        placeholder="10:10"
                        variant="outlined"
                        density="compact"
                        hide-details="auto"
                      ></v-text-field>
                    </v-col>
                  </v-row>
                  <v-btn
                    type="submit"
                    color="primary"
                    variant="elevated"
                    class="align-self-end mt-2 font-weight-bold px-6"
                    :disabled="!isCustomFormValid"
                  >
                    Adicionar Bloqueio Personalizado
                  </v-btn>
                </v-form>
              </v-expansion-panel-text>
            </v-expansion-panel>
          </v-expansion-panels>

          <!-- Lista e Gestão de todos os bloqueios ativos -->
          <div v-if="timeRestrictionsOnly.length > 0" class="mt-4">
            <div class="d-flex align-center justify-space-between mb-3 flex-wrap ga-2">
              <span class="font-weight-bold text-subtitle-2 d-flex align-center">
                <v-icon icon="mdi-shield-lock-outline" class="mr-2" color="error"></v-icon>
                {{ timeRestrictionsOnly.length }} bloqueio(s) de horário ativo(s):
              </span>
              <v-btn
                color="error"
                variant="text"
                size="small"
                class="font-weight-bold text-none"
                @click="clearAllTimeRestrictions"
              >
                Limpar todos os bloqueios
              </v-btn>
            </div>

            <div class="d-flex flex-wrap ga-2">
              <v-chip
                v-for="r in timeRestrictionsOnly"
                :key="r.id"
                color="error"
                variant="elevated"
                closable
                class="font-weight-medium px-3 py-4"
                @click:close="removeRestrictionById(r.id)"
              >
                <v-icon icon="mdi-cancel" start size="small"></v-icon>
                {{ r.day_of_week || r.dia }}: {{ (r.start_time || r.horario_inicio)?.slice(0,5) }} às {{ (r.end_time || r.horario_fim)?.slice(0,5) }}
              </v-chip>
            </div>
          </div>
        </v-expansion-panel-text>
      </v-expansion-panel>
    </v-expansion-panels>

    <!-- Botão Principal de Gerar Grades abaixo de ambos -->
    <v-card class="mt-6 pa-6 rounded-xl border-thin shadow-premium bg-surface d-flex justify-space-between align-center flex-wrap ga-4">
      <div>
        <div class="text-h6 font-weight-bold d-flex align-center ga-2">
          <v-icon icon="mdi-auto-fix" color="primary"></v-icon>
          Pronto para montar sua grade de horários?
        </div>
        <div class="text-body-2 text-medium-emphasis mt-1">
          O sistema analisará todas as {{ interestList.length }} disciplina(s) selecionada(s) (total de {{ dataService.getScheduleTotalCredits(interestList.map(item => item.course?.code)) }} créditos) e os bloqueios de horário informados para sugerir as melhores combinações sem conflito.
        </div>
      </div>

      <v-btn
        color="primary"
        variant="elevated"
        size="x-large"
        rounded="lg"
        prepend-icon="mdi-calendar-clock"
        class="font-weight-bold px-8 shadow-premium"
        :disabled="interestList.length === 0"
        @click="emit('go-generate-schedule', selectedSemester)"
      >
        Gerar Grade de Horários
      </v-btn>
    </v-card>

    <!-- Preference editing dialog -->
    <v-dialog v-model="editDialog.show" max-width="600px" persistent>
      <v-card class="rounded-xl pa-4">
        <v-card-title class="text-h6 font-weight-bold d-flex justify-space-between align-center border-bottom pb-2">
          <span>Editar Preferências - {{ editDialog.course?.name }}</span>
          <v-btn icon="mdi-close" variant="text" @click="closeEditDialog"></v-btn>
        </v-card-title>
        
        <v-card-text class="pt-4">
          <v-alert
            v-if="dataService.getCourseObservation(editDialog.course?.code || editDialog.course?.id)"
            type="warning"
            variant="tonal"
            density="compact"
            icon="mdi-information-outline"
            class="mb-4 text-caption font-weight-medium"
            style="white-space: pre-line;"
          >
            <strong>Observações da Disciplina:</strong><br>
            {{ dataService.getCourseObservation(editDialog.course?.code || editDialog.course?.id) }}
          </v-alert>

          <!-- Edit Priority -->
          <h4 class="text-subtitle-1 font-weight-bold mb-2">Prioridade da Disciplina</h4>
          <v-select
            v-model="editDialog.importanceLevel"
            :items="[
              { title: 'Baixa', value: 'low' },
              { title: 'Média', value: 'medium' },
              { title: 'Alta', value: 'high' }
            ]"
            label="Nível de Prioridade"
            variant="outlined"
            class="mb-4"
            hide-details
          ></v-select>

          <v-btn color="primary" variant="flat" class="rounded-lg mb-6" @click="saveImportancePreference">
            Atualizar Prioridade
          </v-btn>

          <v-divider class="mb-4"></v-divider>

          <!-- Manage Professors -->
          <h4 class="text-subtitle-1 font-weight-bold mb-2">Professores Preferidos</h4>
          
          <!-- List of existing professor preferences -->
          <v-table class="border rounded-lg mb-4" density="comfortable" v-if="editDialogProfessors.length > 0">
            <thead>
              <tr>
                <th>Professor</th>
                <th>Preferência</th>
                <th class="text-center" style="width: 80px;">Ação</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="pref in editDialogProfessors" :key="pref.id">
                <td>{{ pref.preferred_professor }}</td>
                <td style="width: 140px;">
                  <v-select
                    v-model="pref.preference_order"
                    :items="[1, 2, 3]"
                    density="compact"
                    variant="outlined"
                    hide-details
                    @update:model-value="updateProfessorPreferenceOrder(pref)"
                  ></v-select>
                </td>
                <td class="text-center">
                  <v-btn icon="mdi-delete" color="error" variant="text" size="small" @click="deleteProfessorPreference(pref.id)"></v-btn>
                </td>
              </tr>
            </tbody>
          </v-table>
          <v-alert type="info" variant="tonal" class="rounded-lg mb-4" v-else>
            Nenhum professor preferido configurado para esta disciplina.
          </v-alert>

          <!-- Form to add new professor preference -->
          <v-card variant="outlined" class="pa-3 rounded-lg border-thin">
            <h5 class="text-subtitle-2 font-weight-bold mb-2">Adicionar Preferência de Professor</h5>
            <v-row no-gutters class="ga-2">
              <v-col cols="12" sm="7" class="pr-sm-2 mb-2 mb-sm-0">
                <v-combobox
                  v-model="editDialog.newProf"
                  :items="editDialogAvailableProfs"
                  :custom-filter="customProfFilter"
                  label="Selecione o Professor"
                  variant="outlined"
                  density="compact"
                  hide-details
                ></v-combobox>
              </v-col>
              <v-col cols="12" sm="3" class="pr-sm-2 mb-2 mb-sm-0">
                <v-select
                  v-model="editDialog.newOrder"
                  :items="[1, 2, 3]"
                  label="Pref. #"
                  variant="outlined"
                  density="compact"
                  hide-details
                ></v-select>
              </v-col>
              <v-col cols="12" sm="2" class="d-flex align-center justify-center">
                <v-btn color="success" icon="mdi-plus" size="small" :disabled="!editDialog.newProf" @click="addProfessorPreferenceInDialog"></v-btn>
              </v-col>
            </v-row>
          </v-card>
        </v-card-text>
        
        <v-card-actions class="pa-4 pt-2 border-top-thin">
          <v-spacer></v-spacer>
          <v-btn color="primary" variant="tonal" class="rounded-lg" @click="closeEditDialog">
            Fechar
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-snackbar
      v-model="snackbar.show"
      :color="snackbar.color"
      :timeout="snackbar.timeout"
      location="bottom right"
      variant="flat"
      elevation="8"
      class="rounded-xl"
    >
      <div class="d-flex align-center font-weight-medium text-body-2">
        <v-icon :icon="snackbar.color === 'success' ? 'mdi-check-circle' : snackbar.color === 'warning' ? 'mdi-alert' : 'mdi-alert-circle'" class="mr-2" size="large"></v-icon>
        {{ snackbar.text }}
      </div>
      <template v-slot:actions>
        <v-btn variant="text" size="small" class="font-weight-bold" @click="snackbar.show = false">Fechar</v-btn>
      </template>
    </v-snackbar>
  </v-container>
</template>

<script setup>
import { onMounted, reactive, ref, computed, watch } from 'vue'
import { useDisplay } from 'vuetify'
import { dataService } from './services/dataService'
import { curriculumService } from './services/curriculumService'
import { matchCourse, fuzzyMatchName, normalizeText } from './utils/searchUtils'

const props = defineProps({
  studentId: {
    type: Number,
    default: 1
  }
})

const emit = defineEmits(['go-generate-schedule'])

const { mobile } = useDisplay()
const mobileBlockDay = ref('Segunda-feira')

const allCoursesList = ref([])
const eligibleCoursesList = ref([])
const courseSelectionTab = ref('eligible')
const expandedPanels = ref(['0'])
const sectionsList = ref([])

const snackbar = reactive({
  show: false,
  text: '',
  color: 'success',
  timeout: 4000
})
const showSnackbar = (text, color = 'success') => {
  snackbar.text = text
  snackbar.color = color
  snackbar.show = true
}

const semestersList = ref([])
const selectedSemester = ref('')

onMounted(() =>{
  loadCourses();
  loadDesiredCourses();
  loadRestrictions();
  loadDaysOfWeek();
  loadSemesters();
})

const loadCourses = async () => {
  allCoursesList.value = dataService.getAllCourses()
  eligibleCoursesList.value = dataService.getEligibleCourses(curriculumService.selectedCourseRef.value)
}

const loadSemesters = async () => {
  semestersList.value = ['2026/2']
  selectedSemester.value = '2026/2'
}

const loadDesiredCourses = async () => {
  const desired = dataService.getDesiredCourses()
  interestList.value = desired.map(curso => ({ course: curso }))
}

const showPreviewBanner = ref(dataService.hasDesiredCoursesBackup())

const restoreDesiredCourses = () => {
  dataService.restoreDesiredCoursesBackup()
  showPreviewBanner.value = false
  loadDesiredCourses()
}

const daysOfWeekList = ref([])

const loadDaysOfWeek = async () => {
  daysOfWeekList.value = ['Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado']
}

const weeklyCalendarDays = ['Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado']

const weeklyTimeSlots = [
  { label: '08:30 - 10:10 (Manhã A/B)', start: '08:30:00', end: '10:10:00' },
  { label: '10:30 - 12:10 (Manhã C/D)', start: '10:30:00', end: '12:10:00' },
  { label: '13:30 - 15:10 (Tarde E/F)', start: '13:30:00', end: '15:10:00' },
  { label: '15:30 - 17:10 (Tarde G/H)', start: '15:30:00', end: '17:10:00' },
  { label: '18:30 - 20:10 (Noite I/J)', start: '18:30:00', end: '20:10:00' },
  { label: '20:30 - 22:10 (Noite K/L)', start: '20:30:00', end: '22:10:00' }
]

const customRestrictionForm = reactive({
  days: [],
  startTime: '',
  endTime: ''
})

const interestList = ref([])
const restrictionsList = ref([])

const timeRestrictionsOnly = computed(() => {
  return restrictionsList.value.filter(r => {
    const isHard = r.restriction_type === 'hard_block' || !r.restriction_type || r.restriction_type !== 'professor_preference'
    if (!isHard) return false
    const day = r.dia || r.day_of_week
    const start = r.horario_inicio || r.start_time
    const end = r.horario_fim || r.end_time
    return Boolean(day && start && end && start !== ':' && end !== ':' && start !== 'das :' && end !== 'as :')
  })
})


const offeredCourseCodes = computed(() => {
  if (sectionsList.value.length === 0) return new Set()
  const selectedCourse = curriculumService.selectedCourseRef.value
  return new Set(
    sectionsList.value
      .filter(s => {
        const matchesSemester = !selectedSemester.value || s.semester === selectedSemester.value
        const matchesCurriculum = curriculumService.matchesSelectedCurriculum(s.curriculums, selectedCourse)
        return matchesSemester && matchesCurriculum
      })
      .map(s => (s.course_code || s.course_id))
  )
})

const filteredCurriculumCourses = computed(() => {
  if (sectionsList.value.length === 0) return []
  const currentCurriculumSubjects = curriculumService.getCurriculumSubjects(curriculumService.selectedCourseRef.value)
  const currSubjectsMap = new Map(currentCurriculumSubjects.map(s => [s.code, s]))

  const sourceList = courseSelectionTab.value === 'eligible'
    ? eligibleCoursesList.value
    : allCoursesList.value

  const filtered = sourceList.filter(c => {
    const code = c.code || c.id
    return offeredCourseCodes.value.has(code) && currSubjectsMap.has(code)
  })

  return filtered.map(c => {
    const code = c.code || c.id
    const currSub = currSubjectsMap.get(code) || {}
    return {
      ...c,
      semester: currSub.semester || c.semester || 99
    }
  }).sort((a, b) => (a.semester - b.semester) || (a.name || '').localeCompare(b.name || ''))
})

const groupedCurriculumCourses = computed(() => {
  const groups = {}
  filteredCurriculumCourses.value.forEach(course => {
    const sem = course.semester || 99
    if (!groups[sem]) {
      groups[sem] = {
        semester: sem,
        title: sem === 99 ? 'Optativas / Semestre Não Específico' : `${sem}º Semestre da Matriz`,
        courses: []
      }
    }
    groups[sem].courses.push(course)
  })
  return Object.values(groups).sort((a, b) => a.semester - b.semester)
})

const filteredElectiveCourses = computed(() => {
  if (sectionsList.value.length === 0) return []
  const currentCurriculumSubjects = curriculumService.getCurriculumSubjects(curriculumService.selectedCourseRef.value)
  const curriculumCodes = new Set(currentCurriculumSubjects.map(s => s.code))

  const sourceList = courseSelectionTab.value === 'eligible'
    ? eligibleCoursesList.value
    : allCoursesList.value

  return sourceList.filter(c => {
    const code = c.code || c.id
    return offeredCourseCodes.value.has(code) && !curriculumCodes.has(code)
  })
})

const filteredCourses = computed(() => {
  return [...filteredCurriculumCourses.value, ...filteredElectiveCourses.value]
})

const loadSectionsForSemester = async () => {
  sectionsList.value = dataService.getTurmas()
}

watch(selectedSemester, (val) => {
  if (val) localStorage.setItem('ufrgs_selected_semester', val)
  loadSectionsForSemester()
})

watch(() => curriculumService.selectedCourseRef.value, () => {
  loadCourses()
  loadDesiredCourses()
  loadRestrictions()
  loadSectionsForSemester()
  customRestrictionForm.days = []
  customRestrictionForm.startTime = ''
  customRestrictionForm.endTime = ''
})

const isCustomFormValid = computed(() => {
  return customRestrictionForm.days.length > 0 && customRestrictionForm.startTime && customRestrictionForm.endTime
})

const isSlotBlocked = (day, slot) => {
  return restrictionsList.value.some(r => {
    const isHard = r.restriction_type === 'hard_block' || !r.restriction_type || r.restriction_type !== 'professor_preference'
    const sameDay = (r.day_of_week === day || r.dia === day)
    if (!isHard || !sameDay) return false
    const rStart = r.start_time || r.horario_inicio || ''
    const rEnd = r.end_time || r.horario_fim || ''
    return rStart.startsWith(slot.start.slice(0,5)) && rEnd.startsWith(slot.end.slice(0,5))
  })
}

const toggleSlotBlock = async (day, slot) => {
  if (isSlotBlocked(day, slot)) {
    restrictionsList.value = restrictionsList.value.filter(r => {
      const isHard = r.restriction_type === 'hard_block' || !r.restriction_type || r.restriction_type !== 'professor_preference'
      const sameDay = (r.day_of_week === day || r.dia === day)
      if (!isHard || !sameDay) return true
      const rStart = r.start_time || r.horario_inicio || ''
      const rEnd = r.end_time || r.horario_fim || ''
      return !(rStart.startsWith(slot.start.slice(0,5)) && rEnd.startsWith(slot.end.slice(0,5)))
    })
    dataService.saveRestrictions(restrictionsList.value)
    showSnackbar(`Horário desbloqueado em ${day}.`, 'info')
  } else {
    restrictionsList.value.push({
      id: Date.now() + Math.random(),
      restriction_type: 'hard_block',
      dia: day,
      day_of_week: day,
      horario_inicio: slot.start,
      horario_fim: slot.end,
      start_time: slot.start,
      end_time: slot.end
    })
    dataService.saveRestrictions(restrictionsList.value)
    showSnackbar(`Horário bloqueado: ${day} (${slot.start.slice(0,5)} às ${slot.end.slice(0,5)})`, 'warning')
  }
}


const removeFromList = async (index) => {
  const item = interestList.value[index]
  const courseId = item.course?.code || item.course?.id

  interestList.value.splice(index, 1)
  await saveDesiredCourses()

  if (courseId) {
    restrictionsList.value = restrictionsList.value.filter(r => r.course_id !== courseId)
    dataService.saveRestrictions(restrictionsList.value)
    await loadRestrictions()
  }
}

const isCourseSelected = (course) => {
  if (!course) return false
  const targetCode = course.code || course.id
  return interestList.value.some(item => {
    const itemCode = item.course?.code || item.course?.id
    return itemCode === targetCode
  })
}

const toggleCourseSelection = async (course) => {
  if (!course) return
  const targetCode = course.code || course.id
  const existingIdx = interestList.value.findIndex(item => (item.course?.code || item.course?.id) === targetCode)
  if (existingIdx !== -1) {
    await removeFromList(existingIdx)
  } else {
    interestList.value.push({ course })
    await saveDesiredCourses()
    restrictionsList.value.push({
      id: Date.now(),
      restriction_type: 'course_importance',
      course_id: targetCode,
      importance_level: 'medium',
      dia: '',
      horario_inicio: '',
      horario_fim: '',
      preferred_professor: '',
      preference_order: 1
    })
    dataService.saveRestrictions(restrictionsList.value)
    await loadRestrictions()
  }
}


const formatTimeToHHMMSS = (timeStr) => {
  if (!timeStr) return null
  if (timeStr.split(':').length === 2) {
    return timeStr + ':00'
  }
  return timeStr
}

const addCustomRestriction = async () => {
  if (!isCustomFormValid.value) return
  const startStr = formatTimeToHHMMSS(customRestrictionForm.startTime)
  const endStr = formatTimeToHHMMSS(customRestrictionForm.endTime)

  customRestrictionForm.days.forEach((day, idx) => {
    restrictionsList.value.push({
      id: Date.now() + idx + Math.random(),
      restriction_type: 'hard_block',
      dia: day,
      day_of_week: day,
      horario_inicio: startStr,
      horario_fim: endStr,
      start_time: startStr,
      end_time: endStr
    })
  })

  dataService.saveRestrictions(restrictionsList.value)
  customRestrictionForm.days = []
  customRestrictionForm.startTime = ''
  customRestrictionForm.endTime = ''
  showSnackbar('Bloqueio personalizado adicionado com sucesso.', 'success')
}

const clearAllTimeRestrictions = () => {
  restrictionsList.value = restrictionsList.value.filter(r => r.restriction_type === 'professor_preference')
  dataService.saveRestrictions(restrictionsList.value)
  showSnackbar('Todos os bloqueios de horário foram removidos.', 'info')
}

const removeRestrictionById = async (id) => {
  restrictionsList.value = restrictionsList.value.filter(r => r.id !== id)
  dataService.saveRestrictions(restrictionsList.value)
  await loadRestrictions()
}

const saveDesiredCourses = async () => {
  const courses = interestList.value.map(item => item.course).filter(Boolean)
  dataService.saveDesiredCourses(courses)
}

const loadRestrictions = async () => {
  const raw = dataService.getRestrictions()
  restrictionsList.value = raw.map(restricao => ({
    id: restricao.id,
    restriction_type: restricao.restriction_type || 'hard_block',
    dia: restricao.dia || restricao.day_of_week || '',
    day_of_week: restricao.day_of_week || restricao.dia || '',
    horario_inicio: restricao.horario_inicio || restricao.start_time || '',
    horario_fim: restricao.horario_fim || restricao.end_time || '',
    start_time: restricao.start_time || restricao.horario_inicio || '',
    end_time: restricao.end_time || restricao.horario_fim || '',
    course_id: restricao.course_id,
    preferred_professor: restricao.preferred_professor,
    preference_order: restricao.preference_order,
    importance_level: restricao.importance_level,
  })).filter(r => {
    if (r.restriction_type === 'professor_preference') return Boolean(r.course_id && r.preferred_professor)
    const day = r.dia || r.day_of_week
    const start = r.horario_inicio || r.start_time
    const end = r.horario_fim || r.end_time
    return Boolean(day && start && end && start !== ':' && end !== ':' && start !== 'das :' && end !== 'as :')
  })
}

const editDialog = reactive({
  show: false,
  course: null,
  importanceLevel: 'medium',
  newProf: '',
  newOrder: 1
})

const editDialogProfessors = computed(() => {
  if (!editDialog.course) return []
  const targetCode = editDialog.course.code || editDialog.course.id
  return restrictionsList.value.filter(
    r => r.course_id === targetCode && r.restriction_type === 'professor_preference'
  )
})

const editDialogAvailableProfs = computed(() => {
  if (!editDialog.course) return []
  const targetCode = editDialog.course.code || editDialog.course.id
  const courseSections = sectionsList.value.filter(s => {
    const sCode = s.course_code || s.course_id
    const semMatch = !selectedSemester.value || s.semester === selectedSemester.value
    const currMatch = curriculumService.matchesSelectedCurriculum(s.curriculums, curriculumService.selectedCourseRef.value)
    return sCode === targetCode && semMatch && currMatch
  })
  const profs = courseSections
    .map(s => s.professor_name)
    .filter(Boolean)
    .map(name => name.trim())
  return [...new Set(profs)].sort()
})

const customCourseFilter = (value, query, item) => {
  if (!query) return true
  const course = item?.raw || item || {}
  return matchCourse(course, query)
}

const customProfFilter = (value, query, item) => {
  if (!query) return true
  const profName = typeof item?.raw === 'string' ? item.raw : (item?.raw?.title || item?.title || typeof value === 'string' ? value : '')
  return fuzzyMatchName(profName, query)
}

const openEditDialog = (item) => {
  const course = item.course
  editDialog.course = course
  const targetCode = course.code || course.id
  
  const r = restrictionsList.value.find(
    x => x.course_id === targetCode && x.restriction_type === 'course_importance'
  )
  editDialog.importanceLevel = r ? r.importance_level : 'medium'
  
  editDialog.newProf = ''
  editDialog.newOrder = 1
  editDialog.show = true
}

const closeEditDialog = () => {
  editDialog.show = false
  editDialog.course = null
}

const saveImportancePreference = async () => {
  if (!editDialog.course) return
  const courseId = editDialog.course.code || editDialog.course.id
  restrictionsList.value = restrictionsList.value.filter(
    r => !(r.course_id === courseId && r.restriction_type === 'course_importance')
  )

  restrictionsList.value.push({
    id: Date.now(),
    restriction_type: 'course_importance',
    course_id: courseId,
    importance_level: editDialog.importanceLevel,
    dia: '',
    horario_inicio: '',
    horario_fim: ''
  })

  dataService.saveRestrictions(restrictionsList.value)
  showSnackbar('Prioridade da disciplina atualizada com sucesso!', 'success')
  await loadRestrictions()
}

const deleteProfessorPreference = async (id) => {
  restrictionsList.value = restrictionsList.value.filter(r => r.id !== id)
  dataService.saveRestrictions(restrictionsList.value)
  await loadRestrictions()
}

const addProfessorPreferenceInDialog = async () => {
  if (!editDialog.course || !editDialog.newProf) return
  const courseId = editDialog.course.code || editDialog.course.id
  const profName = editDialog.newProf.trim()

  const alreadyExists = editDialogProfessors.value.some(
    p => normalizeText(p.preferred_professor) === normalizeText(profName)
  )

  if (alreadyExists) {
    showSnackbar('Este professor já foi adicionado para esta disciplina!', 'warning')
    return
  }

  restrictionsList.value.push({
    id: Date.now(),
    restriction_type: 'professor_preference',
    course_id: courseId,
    preferred_professor: profName,
    preference_order: editDialog.newOrder,
    dia: '',
    horario_inicio: '',
    horario_fim: ''
  })

  dataService.saveRestrictions(restrictionsList.value)
  editDialog.newProf = ''
  editDialog.newOrder = 1
  await loadRestrictions()
}

const updateProfessorPreferenceOrder = async (pref) => {
  if (!editDialog.course) return
  const target = restrictionsList.value.find(r => r.id === pref.id)
  if (target) {
    target.preference_order = pref.preference_order
  }
  dataService.saveRestrictions(restrictionsList.value)
  await loadRestrictions()
}
</script>

<style scoped>
.time-cell {
  transition: background-color 0.15s ease;
}
.time-cell:hover {
  background-color: rgba(var(--v-theme-on-surface), 0.05);
}
</style>