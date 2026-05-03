package api

import (
	"context"
	"gps-tracking-system/internal/auth"
	"gps-tracking-system/internal/config"
	"net/http"
	"strings"
)

func AuthMiddleware(cfg *config.Config) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			authHeader := r.Header.Get("Authorization")
			if authHeader == "" {
				RespondWithError(w, http.StatusUnauthorized, "Missing auth token")
				return
			}

			tokenParts := strings.Split(authHeader, " ")
			if len(tokenParts) != 2 || tokenParts[0] != "Bearer" {
				RespondWithError(w, http.StatusUnauthorized, "Invalid token format")
				return
			}

			claims, err := auth.ValidateToken(tokenParts[1], cfg.JWTSecret)
			if err != nil {
				RespondWithError(w, http.StatusUnauthorized, "Invalid token")
				return
			}

			// Add claims to context
			ctx := context.WithValue(r.Context(), "user", claims)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}
