import { createApp } from 'vue'
import App from './App.vue'
import './styles.css'

import 'vuetify/styles'
import '@mdi/font/css/materialdesignicons.css'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'

const vuetify = createVuetify({
  components,
  directives,
  icons: {
    defaultSet: 'mdi',
  },
  theme: {
    defaultTheme: localStorage.getItem('theme') || 'light',
    themes: {
      light: {
        dark: false,
        colors: {
          primary: '#0F4C81', // Sleek academic deep blue
          secondary: '#3B82F6',
          accent: '#10B981',
          error: '#EF4444',
          warning: '#F59E0B',
          info: '#3B82F6',
          success: '#10B981',
          background: '#F8FAFC',
          surface: '#FFFFFF'
        }
      },
      dark: {
        dark: true,
        colors: {
          primary: '#60A5FA',
          secondary: '#3B82F6',
          accent: '#34D399',
          error: '#F87171',
          warning: '#FBBF24',
          info: '#60A5FA',
          success: '#34D399',
          background: '#0F172A',
          surface: '#1E293B'
        }
      }
    }
  }
})

const app = createApp(App)
app.use(vuetify)
app.mount('#app')