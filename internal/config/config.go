package config

import (
	"encoding/json"
	"os"
)

type Config struct {
	Port         string  `json:"port"`
	GameDuration int     `json:"game_duration"` // Seconds
	BaseRadius   float64 `json:"base_radius"`
	RadiusStep   float64 `json:"radius_step"`
}

func LoadConfig(path string) (*Config, error) {
	file, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer file.Close()

	decoder := json.NewDecoder(file)
	config := &Config{}
	err = decoder.Decode(config)
	if err != nil {
		return nil, err
	}

	return config, nil
}
