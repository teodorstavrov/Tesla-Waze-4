export interface SpeedCamera {
  id:        string
  lat:       number
  lng:       number
  maxspeed:  number | null
  direction: number | null
}

export interface CamerasApiResponse {
  cameras: SpeedCamera[]
  count:   number
}
