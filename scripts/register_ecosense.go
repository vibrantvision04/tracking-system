package main

import (
	"context"
	"fmt"
	"log"

	"gps-tracking-system/internal/client"
	"gps-tracking-system/internal/config"
	"gps-tracking-system/internal/repository"
)

func main() {
	fmt.Println("1. Loading Config and Connecting to DB...")
	cfg := config.LoadConfig()
	db, err := repository.InitDB(cfg)
	if err != nil {
		log.Fatalf("Failed to connect to DB: %v", err)
	}
	defer db.Close()

	vRepo := repository.NewVehicleRepository(db)

	fmt.Println("2. Fetching live vehicles from EcoSense API...")
	ecoClient := client.NewEcoSenseClient()
	if err := ecoClient.Login(); err != nil {
		log.Fatalf("EcoSense Login failed: %v", err)
	}

	vehicles, err := ecoClient.FetchVehicles()
	if err != nil {
		log.Fatalf("EcoSense FetchVehicles failed: %v", err)
	}
	
	fmt.Printf("   Found %d vehicles from EcoSense!\n", len(vehicles))

	fmt.Println("3. Registering vehicles into PostgreSQL...")
	
	ctx := context.Background()
	
	// Fetch existing device IMEIs to avoid duplicates
	existingDevices, err := vRepo.GetDevices(ctx)
	if err != nil {
		log.Fatalf("Failed to fetch existing devices: %v", err)
	}
	
	existingMap := make(map[string]bool)
	for _, d := range existingDevices {
		existingMap[d.IMEI] = true
	}

	// Fetch existing vehicle types
	types, err := vRepo.GetTypes(ctx)
	if err != nil {
		log.Fatalf("Failed to fetch vehicle types: %v", err)
	}
	typeMap := make(map[string]int)
	for _, t := range types {
		typeMap[t.Name] = t.ID
	}

	newCount := 0
	for _, ev := range vehicles {
		if ev.Number == "" {
			continue
		}

		if existingMap[ev.Number] {
			continue // Already registered
		}
		
		fmt.Printf("Registering vehicle %d/%d: %s\n", newCount+1, len(vehicles), ev.Number)

		// Check if vehicle type exists, if not create it
		catName := ev.Category
		if catName == "" {
			catName = "Unknown"
		}
		
		typeID, exists := typeMap[catName]
		if !exists {
			newType := &repository.VehicleType{
				Name:      catName,
				IconColor: "#22c55e",
			}
			if err := vRepo.CreateType(ctx, newType); err != nil {
				log.Printf("Failed to create type %s: %v", catName, err)
				continue
			}
			typeID = newType.ID
			typeMap[catName] = typeID
		}

		// Create Device
		newDevice := &repository.GpsDevice{
			IMEI:       ev.Number,
			SerialNo:   ev.Number,
			DeviceType: "EcoSense API",
			IsActive:   true,
		}
		if err := vRepo.CreateDevice(ctx, newDevice); err != nil {
			log.Printf("Failed to create device %s: %v", ev.Number, err)
			continue
		}

		// Create Vehicle
		newVehicle := &repository.Vehicle{
			RegistrationNo: ev.Number,
			ChassisNo:      "EcoSense-" + ev.ID,
			IsOwned:        true,
			VehicleTypeID:  &typeID,
			IsActive:       true,
		}
		if err := vRepo.CreateVehicle(ctx, newVehicle); err != nil {
			log.Printf("Failed to create vehicle %s: %v", ev.Number, err)
			continue
		}

		// Map Device to Vehicle
		if err := vRepo.MapDevice(ctx, newVehicle.ID, newDevice.ID); err != nil {
			log.Printf("Failed to map device %s: %v", ev.Number, err)
			continue
		}

		newCount++
	}

	fmt.Printf("\nSuccessfully injected %d brand new EcoSense vehicles directly into your official database!\n", newCount)
	fmt.Println("The dashboard will now recognize them instantly without ANY 404 errors.")
}
