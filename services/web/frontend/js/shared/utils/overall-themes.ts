import type { OverallThemeMeta } from '@ol-types/project-settings'
import getMeta from '@/utils/meta'

const fallbackOverallThemes: OverallThemeMeta[] = [
  {
    name: 'Dark',
    val: '',
  },
  {
    name: 'Light',
    val: 'light-',
  },
  {
    name: 'System',
    val: 'system',
  },
]

export const getAvailableOverallThemes = (): OverallThemeMeta[] =>
  getMeta('ol-overallThemes') || fallbackOverallThemes
