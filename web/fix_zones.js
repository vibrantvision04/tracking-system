const { Client } = require('pg');
const turf = require('@turf/turf');

async function fixZones() {
  const client = new Client({
    connectionString: "postgres://gps:password@localhost:5432/gpsdb?sslmode=disable",
  });

  await client.connect();

  try {
    // 1. Get all Zones (region_type_id = 2)
    const resZones = await client.query(`
      SELECT r.id, r.region_name, r.geofence_id, g.color
      FROM regions r
      LEFT JOIN geofences g ON r.geofence_id = g.id
      WHERE r.region_type_id = 2 AND r.is_active = true
    `);
    const zones = resZones.rows;
    console.log(`Found ${zones.length} zones.`);

    const palette = [
      '#e6194b', '#3cb44b', '#ffe119', '#4363d8', '#f58231',
      '#911eb4', '#46f0f0', '#f032e6', '#bcf60c', '#fabebe',
      '#008080', '#e6beff', '#9a6324', '#fffac8', '#800000',
      '#aaffc3', '#808000', '#ffd8b1', '#000075', '#808080'
    ];
    let colorIndex = 0;

    for (const zone of zones) {
      console.log(`Processing Zone: ${zone.region_name} (ID: ${zone.id})`);
      
      const distinctColor = palette[colorIndex % palette.length];
      colorIndex++;
      
      // 2. Get Wards for this Zone (region_type_id = 3, parent_id = zone.id)
      const resWards = await client.query(`
        SELECT r.id, r.region_name, g.polygon, g.id as ward_geofence_id
        FROM regions r
        JOIN geofences g ON r.geofence_id = g.id
        WHERE r.parent_id = $1 AND r.region_type_id = 3 AND r.is_active = true
      `, [zone.id]);

      const wards = resWards.rows;
      console.log(`  Found ${wards.length} wards for this zone.`);
      
      if (wards.length === 0) continue;

      let features = [];
      for (const ward of wards) {
        if (!ward.polygon) continue;
        const geom = typeof ward.polygon === 'string' ? JSON.parse(ward.polygon) : ward.polygon;
        
        if (geom.type === "FeatureCollection" && geom.features) {
          features.push(...geom.features);
        } else if (geom.type === "Feature") {
          features.push(geom);
        } else if (geom.type === "Polygon" || geom.type === "MultiPolygon") {
          features.push(turf.feature(geom));
        }
      }

      if (features.length === 0) {
        console.log(`  No valid polygons found in wards.`);
        continue;
      }

      console.log(`  Merging ${features.length} ward features...`);
      let unioned = features[0];
      for (let i = 1; i < features.length; i++) {
        try {
          unioned = turf.union(turf.featureCollection([unioned, features[i]]));
        } catch(e) {
          console.error(`  Error unioning ward ${i}:`, e.message);
        }
      }

      if (unioned) {
        const fc = turf.featureCollection([unioned]);
        const newPolyJson = JSON.stringify(fc);

        if (zone.geofence_id) {
          // Update existing zone geofence
          await client.query(`
            UPDATE geofences 
            SET polygon = $1::jsonb, color = $2 
            WHERE id = $3
          `, [newPolyJson, distinctColor, zone.geofence_id]);
          console.log(`  Updated existing geofence (ID: ${zone.geofence_id}) with color ${distinctColor}`);
        } else {
          // Create new zone geofence
          const gRes = await client.query(`
            INSERT INTO geofences (name, type, polygon, color)
            VALUES ($1, 'polygon', $2::jsonb, $3)
            RETURNING id
          `, [zone.region_name + "_geom", newPolyJson, distinctColor]);
          
          await client.query(`
            UPDATE regions SET geofence_id = $1 WHERE id = $2
          `, [gRes.rows[0].id, zone.id]);
          console.log(`  Created new geofence (ID: ${gRes.rows[0].id}) with color ${distinctColor}`);
        }
        
        // Also ensure all wards have the same color as the zone
        for (const ward of wards) {
           await client.query(`
             UPDATE geofences SET color = $1 WHERE id = $2
           `, [distinctColor, ward.ward_geofence_id]);
        }
        console.log(`  Updated color for all wards to ${distinctColor}`);
      }
    }
    console.log("All done!");
  } catch (err) {
    console.error("Error:", err);
  } finally {
    await client.end();
  }
}

fixZones();
