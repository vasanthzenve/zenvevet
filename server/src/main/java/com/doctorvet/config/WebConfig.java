package com.doctorvet.config;

import com.doctorvet.security.AuthInterceptor;
import com.doctorvet.security.RateLimitInterceptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import java.nio.file.Paths;

@Configuration
public class WebConfig implements WebMvcConfigurer {

    private final AuthInterceptor authInterceptor;
    private final RateLimitInterceptor rateLimitInterceptor;

    @Autowired
    public WebConfig(AuthInterceptor authInterceptor, RateLimitInterceptor rateLimitInterceptor) {
        this.authInterceptor = authInterceptor;
        this.rateLimitInterceptor = rateLimitInterceptor;
    }

    public WebConfig(AuthInterceptor authInterceptor) {
        this.authInterceptor = authInterceptor;
        this.rateLimitInterceptor = null;
    }

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        registry.addMapping("/**")
                .allowedOriginPatterns(
                        "http://localhost:*",
                        "http://127.0.0.1:*",
                        "https://*.zenvevet.com",
                        "https://zenvevet.com")
                .allowedMethods("GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH")
                .allowedHeaders("*")
                .allowCredentials(true)
                .maxAge(3600);
    }

    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        String u1 = Paths.get("uploads").toAbsolutePath().normalize().toUri().toString();
        if (!u1.endsWith("/"))
            u1 += "/";
        String u2 = Paths.get("..", "uploads").toAbsolutePath().normalize().toUri().toString();
        if (!u2.endsWith("/"))
            u2 += "/";
        String u3 = Paths.get("server", "uploads").toAbsolutePath().normalize().toUri().toString();
        if (!u3.endsWith("/"))
            u3 += "/";

        registry.addResourceHandler("/uploads/**")
                .addResourceLocations(u1, u2, u3);
    }

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        // 1. Rate Limiting Interceptor: Protects all API endpoints against abuse &
        // brute-force
        if (rateLimitInterceptor != null) {
            registry.addInterceptor(rateLimitInterceptor)
                    .addPathPatterns("/api/**")
                    .excludePathPatterns("/actuator/**", "/uploads/**");
        }

        // 2. Authentication Interceptor: Enforces authentication on private
        // doctor-to-doctor endpoints
        if (authInterceptor != null) {
            registry.addInterceptor(authInterceptor)
                    .addPathPatterns(
                            "/api/v1/chat/**",
                            "/api/v1/connections/**",
                            "/api/v1/notifications/**")
                    .excludePathPatterns(
                            "/api/v1/auth/**",
                            "/api/v1/feed/**",
                            "/api/v1/doctors/**",
                            "/api/v1/cases/**",
                            "/api/v1/videos/**",
                            "/api/v1/notifications/broadcast",
                            "/uploads/**",
                            "/ws/**",
                            "/ws-chat/**");
        }
    }
}
