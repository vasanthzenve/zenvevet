package com.doctorvet;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.util.List;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.cache.annotation.EnableCaching;
import org.springframework.scheduling.annotation.EnableAsync;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableAsync
@EnableCaching
@EnableScheduling
public class DoctorVetServerApplication {
	
	public static void main(String[] args) {
		loadDotEnv();
		SpringApplication.run(DoctorVetServerApplication.class, args);
	}

	private static void loadDotEnv() {
		File[] candidates = new File[] {
				new File(".env"),
				new File("../.env"),
				new File("server/.env")
		};
		for (File f : candidates) {
			if (f.exists() && f.isFile()) {
				try {
					List<String> lines = Files.readAllLines(f.toPath());
					for (String line : lines) {
						String trimmed = line.trim();
						if (trimmed.isEmpty() || trimmed.startsWith("#"))
							continue;
						int eq = trimmed.indexOf('=');
						if (eq > 0) {
							String key = trimmed.substring(0, eq).trim();
							String val = trimmed.substring(eq + 1).trim();
							System.setProperty(key, val);
						}
					}
					System.out.println("[Zenve-Vet] Successfully loaded environment from: " + f.getAbsolutePath());
					break;
				} catch (IOException | SecurityException e) {
					System.err.println("[Zenve-Vet] Failed to read .env file: " + e.getMessage());
				}
			}
		}
	}

}
