package main

import (
	"encoding/json"
	"fmt"
	"os"
)

func main() {
	// 1. iswmmovement.json
	data, err := os.ReadFile("E:\\dataswim\\iswmmovement.json")
	if err != nil {
		fmt.Printf("Error reading iswmmovement.json: %v\n", err)
	} else {
		// Try parsing wrapped format
		var wrapped struct {
			Data []interface{} `json:"data"`
		}
		if err := json.Unmarshal(data, &wrapped); err == nil {
			fmt.Printf("iswmmovement.json has wrapped data: %d items\n", len(wrapped.Data))
			if len(wrapped.Data) > 0 {
				bytes, _ := json.MarshalIndent(wrapped.Data[0], "", "  ")
				fmt.Printf("First item:\n%s\n", string(bytes))
			}
		} else {
			var list []interface{}
			if err := json.Unmarshal(data, &list); err == nil {
				fmt.Printf("iswmmovement.json has list: %d items\n", len(list))
				if len(list) > 0 {
					bytes, _ := json.MarshalIndent(list[0], "", "  ")
					fmt.Printf("First item:\n%s\n", string(bytes))
				}
			} else {
				fmt.Println("Could not parse iswmmovement.json")
			}
		}
	}

	// 2. iswm zone data.json
	data, err = os.ReadFile("E:\\dataswim\\iswm zone data.json")
	if err != nil {
		fmt.Printf("Error reading zone data: %v\n", err)
	} else {
		var result map[string]interface{}
		if err := json.Unmarshal(data, &result); err == nil {
			if list, ok := result["data"].([]interface{}); ok {
				fmt.Printf("zone data: %d items\n", len(list))
				if len(list) > 0 {
					bytes, _ := json.MarshalIndent(list[0], "", "  ")
					fmt.Printf("First item:\n%s\n", string(bytes))
				}
			}
		}
	}

	// 3. swimwarddata.json
	data, err = os.ReadFile("E:\\dataswim\\swimwarddata.json")
	if err != nil {
		fmt.Printf("Error reading ward data: %v\n", err)
	} else {
		var result map[string]interface{}
		if err := json.Unmarshal(data, &result); err == nil {
			if list, ok := result["data"].([]interface{}); ok {
				fmt.Printf("ward data: %d items\n", len(list))
				if len(list) > 0 {
					bytes, _ := json.MarshalIndent(list[0], "", "  ")
					fmt.Printf("First item:\n%s\n", string(bytes))
				}
			}
		}
	}
}
