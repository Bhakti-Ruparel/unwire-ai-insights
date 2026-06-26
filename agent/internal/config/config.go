package config

import (
	"encoding/json"
	"os"
	"path/filepath"
	"runtime"
	"strings"
)

type Config struct {
	Token           string `json:"token"`
	ServerURL       string `json:"serverUrl"`
	ServerID        string `json:"serverId"`
	IntervalSeconds int    `json:"intervalSeconds"`
}

func configDir() string {
	if runtime.GOOS == "windows" {
		return filepath.Join(os.Getenv("ProgramData"), "unwire-agent")
	}
	return "/etc/unwire-agent"
}

func configPath() string {
	return filepath.Join(configDir(), "config.json")
}

func ParseFlags(args []string) *Config {
	cfg := &Config{
		ServerURL:       "http://localhost:5000",
		IntervalSeconds: 30,
	}

	for i := 0; i < len(args); i++ {
		switch args[i] {
		case "--token":
			if i+1 < len(args) {
				cfg.Token = args[i+1]
				i++
			}
		case "--server":
			if i+1 < len(args) {
				cfg.ServerURL = strings.TrimRight(args[i+1], "/")
				i++
			}
		case "--interval":
			if i+1 < len(args) {
				var interval int
				if _, err := parseIntArg(args[i+1], &interval); err == nil && interval > 0 {
					cfg.IntervalSeconds = interval
				}
				i++
			}
		case "--server-id":
			if i+1 < len(args) {
				cfg.ServerID = args[i+1]
				i++
			}
		}
	}
	return cfg
}

func Save(cfg *Config) error {
	dir := configDir()
	if err := os.MkdirAll(dir, 0700); err != nil {
		return err
	}
	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(configPath(), data, 0600)
}

func Load() (*Config, error) {
	data, err := os.ReadFile(configPath())
	if err != nil {
		return nil, err
	}
	cfg := &Config{}
	if err := json.Unmarshal(data, cfg); err != nil {
		return nil, err
	}
	if cfg.ServerURL == "" {
		cfg.ServerURL = "http://localhost:5000"
	}
	if cfg.IntervalSeconds <= 0 {
		cfg.IntervalSeconds = 30
	}
	return cfg, nil
}

func parseIntArg(s string, out *int) (int, error) {
	var v int
	for _, c := range s {
		if c < '0' || c > '9' {
			return 0, os.ErrInvalid
		}
		v = v*10 + int(c-'0')
	}
	*out = v
	return v, nil
}
