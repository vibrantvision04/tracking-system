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

		fmt.Println("2. Fetching live vehicles from Acceldash API...")
		accelClient := client.NewAcceldashClient()
		if err := accelClient.Login(); err != nil {
			log.Fatalf("Acceldash Login failed: %v", err)
		}

		vehicles, err := accelClient.FetchVehicles()
		if err != nil {
			log.Fatalf("Acceldash FetchVehicles failed: %v", err)
		}
		
		fmt.Printf("   Found %d vehicles from Acceldash!\n", len(vehicles))

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
		for _, av := range vehicles {
			if av.RegistrationNo == "" {
				continue
			}

			// We use RegistrationNo as IMEI for tracking since it's the unique identifier we'll use in main.go
			imei := av.RegistrationNo

			// Extract type name if available
			catName := "Acceldash Vehicle"
			if av.VehicleMakes != nil && av.VehicleMakes.VehicleMakeName != "" {
				catName = av.VehicleMakes.VehicleMakeName
			} else if av.VehicleTypes != nil && av.VehicleTypes.VehicleTypeName != "" {
				catName = av.VehicleTypes.VehicleTypeName
			}

			// Map specific types as requested by user
			if catName == "Partition Tipper" || catName == "Partitioned Tipper" {
				catName = "Feeder Vehicle"
			}
			
			typeID, exists := typeMap[catName]
			if !exists {
				newType := &repository.VehicleType{
					Name:      catName,
					IconColor: "#3b82f6", // Blue for Acceldash
				}
				if err := vRepo.CreateType(ctx, newType); err != nil {
					log.Printf("Failed to create type %s: %v", catName, err)
					continue
				}
				typeID = newType.ID
				typeMap[catName] = typeID
			}

			if existingMap[imei] {
				// Update existing vehicle's type
				_, err := db.Exec(ctx, `
					UPDATE vehicles 
					SET vehicle_type_id = $1 
					WHERE registration_no = $2
				`, typeID, av.RegistrationNo)
				if err != nil {
					log.Printf("Failed to update vehicle type for %s: %v", av.RegistrationNo, err)
				} else {
					fmt.Printf("Updated vehicle type for %s to %s\n", av.RegistrationNo, catName)
				}
				continue 
			}
			
			fmt.Printf("Registering Acceldash vehicle %d/%d: %s\n", newCount+1, len(vehicles), av.RegistrationNo)

			// Create Device
			newDevice := &repository.GpsDevice{
				IMEI:       imei,
				SerialNo:   imei,
				DeviceType: "Acceldash API",
				IsActive:   true,
			}
			if err := vRepo.CreateDevice(ctx, newDevice); err != nil {
				log.Printf("Failed to create device %s: %v", imei, err)
				continue
			}

			// Create Vehicle
			chassisNo := av.ChassisNo
			if chassisNo == "" {
				chassisNo = fmt.Sprintf("Acceldash-%d", av.ID)
			}

			newVehicle := &repository.Vehicle{
				RegistrationNo: av.RegistrationNo,
				ChassisNo:      chassisNo,
				IsOwned:        av.IsOwned,
				VehicleTypeID:  &typeID,
				IsActive:       true,
			}
			if err := vRepo.CreateVehicle(ctx, newVehicle); err != nil {
				log.Printf("Failed to create vehicle %s: %v", av.RegistrationNo, err)
				continue
			}

			// Map Device to Vehicle
			if err := vRepo.MapDevice(ctx, newVehicle.ID, newDevice.ID); err != nil {
				log.Printf("Failed to map device %s: %v", imei, err)
				continue
			}

			newCount++
		}

		fmt.Printf("\nSuccessfully injected %d brand new Acceldash vehicles into the database!\n", newCount)
	}
