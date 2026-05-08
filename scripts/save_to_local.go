package main

import (
	"fmt"
	"io"
	"log"
	"os"
)

func main() {
	destDir := `E:\dataswim`
	
	files := []string{
		"ecosence warddata .json",
		"ecosence zonedata  copy.json",
		"iswm zone data.json",
		"swimwarddata.json",
	}

	for _, f := range files {
		err := copyFile(f, destDir+`\`+f)
		if err != nil {
			log.Printf("Failed to copy %s: %v", f, err)
		} else {
			fmt.Printf("Copied %s to %s\n", f, destDir)
		}
	}

	fmt.Println("Done copying files to local storage!")
}

func copyFile(src, dst string) error {
	sourceFile, err := os.Open(src)
	if err != nil {
		return err
	}
	defer sourceFile.Close()

	destFile, err := os.Create(dst)
	if err != nil {
		return err
	}
	defer destFile.Close()

	_, err = io.Copy(destFile, sourceFile)
	return err
}
