export type TimelineScene = {
  id: string
  project_id?: string
  storyboard_id?: string | null
  part_number?: number
  scene_number: number
  start_time?: number
  end_time?: number
  duration: number
  action?: string | null
  vo?: string | null
  visual_description?: string | null
  scene_goal?: string | null
  image_prompt?: string | null
  negative_prompt?: string | null
  motion_prompt?: string | null
  camera?: string | null
  image_path?: string | null
  video_path?: string | null
  audio_path?: string | null
  tts_path?: string | null
  subtitle_path?: string | null
  image_status?: string | null
  video_status?: string | null
  tts_status?: string | null
  locked?: boolean
}

export type TimelineEdit = {
  voOffset: number
  voVolume: number
  subtitleEnabled: boolean
  subtitleText: string
}

export type TimelinePayload = {
  duration: number
  music: {
    file_name: string
    volume: number
    fade_in: number
    fade_out: number
  }
  tracks: {
    video: Array<{
      scene_id: string
      scene_number: number
      start: number
      end: number
      duration: number
      src: string
    }>
    voice: Array<{
      scene_id: string
      scene_number: number
      start: number
      end: number
      offset: number
      volume: number
      text: string
      src: string
    }>
    subtitles: Array<{
      scene_id: string
      scene_number: number
      start: number
      end: number
      text: string
    }>
  }
}
