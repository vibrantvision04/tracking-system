package api

import (
	"encoding/json"
	"gps-tracking-system/internal/audit"
	"gps-tracking-system/internal/auth"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
)

type UserResponse struct {
	ID        int       `json:"id"`
	Email     string    `json:"email"`
	Role      string    `json:"role"`
	CreatedAt time.Time `json:"created_at"`
}

func (h *Handler) Login(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	db := h.gpsRepo.Pool()

	var req struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid payload"})
		return
	}
	if req.Email == "" || req.Password == "" {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Email and password are required"})
		return
	}

	lockKey := "lockout:" + req.Email
	locked, _ := h.rdb.Get(ctx, lockKey).Bool()
	if locked {
		sendJSON(w, http.StatusTooManyRequests, map[string]string{"error": "Account locked due to too many failed attempts. Try again in 15 minutes."})
		return
	}

	var user struct {
		ID           int
		Email        string
		Role         string
		PasswordHash string
	}

	err := db.QueryRow(ctx, `
		SELECT id, email, COALESCE(role, 'USER'), COALESCE(password_hash, '')
		FROM users
		WHERE email = $1
		LIMIT 1
	`, req.Email).Scan(&user.ID, &user.Email, &user.Role, &user.PasswordHash)
	if err != nil {
		_ = h.rdb.Incr(ctx, "fail:"+req.Email)
		_ = h.rdb.Expire(ctx, "fail:"+req.Email, 15*time.Minute)
		h.auditLogger.Log(r.Context(), audit.EventLoginFailure, 0, req.Email, clientIP(r), nil)
		sendJSON(w, http.StatusUnauthorized, map[string]string{"error": "Invalid email or password"})
		return
	}

	if !auth.VerifyPassword(user.PasswordHash, req.Password) {
		failCount, _ := h.rdb.Incr(ctx, "fail:"+req.Email).Result()
		h.rdb.Expire(ctx, "fail:"+req.Email, 15*time.Minute)
		if failCount >= 5 {
			h.rdb.Set(ctx, "lockout:"+req.Email, true, 15*time.Minute)
		}
		h.auditLogger.Log(r.Context(), audit.EventLoginFailure, 0, req.Email, clientIP(r), nil)
		sendJSON(w, http.StatusUnauthorized, map[string]string{"error": "Invalid email or password"})
		return
	}

	h.rdb.Del(ctx, "fail:"+req.Email, "lockout:"+req.Email)
	h.auditLogger.Log(r.Context(), audit.EventLoginSuccess, user.ID, user.Email, clientIP(r), nil)

	accessToken, err := auth.GenerateAccessToken(user.ID, user.Email, user.Role, h.jwtAccessSecret)
	if err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to generate token"})
		return
	}

	tokenID, refreshToken, err := auth.GenerateRefreshToken(user.ID, user.Email, user.Role, h.jwtRefreshSecret)
	if err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to generate refresh token"})
		return
	}

	_, _ = db.Exec(ctx, `
		INSERT INTO refresh_tokens (token_id, user_id, expires_at)
		VALUES ($1, $2, NOW() + INTERVAL '7 days')
		ON CONFLICT DO NOTHING
	`, auth.HashTokenID(tokenID), user.ID)

	sendJSON(w, http.StatusOK, map[string]interface{}{
		"success":       true,
		"access_token":  accessToken,
		"refresh_token": refreshToken,
		"user": map[string]interface{}{
			"id":    user.ID,
			"email": user.Email,
			"role":  user.Role,
		},
	})
}

func (h *Handler) RefreshToken(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	db := h.gpsRepo.Pool()

	var req struct {
		RefreshToken string `json:"refresh_token"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid payload"})
		return
	}

	claims, err := auth.ValidateRefreshToken(req.RefreshToken, h.jwtRefreshSecret)
	if err != nil {
		sendJSON(w, http.StatusUnauthorized, map[string]string{"error": "Invalid or expired refresh token"})
		return
	}

	// Check server-side revocation + DB expiry
	var revokedAt *time.Time
	var expiresAt time.Time
	err = db.QueryRow(ctx, `
		SELECT revoked_at, expires_at FROM refresh_tokens
		WHERE token_id = $1
	`, auth.HashTokenID(claims.TokenID)).Scan(&revokedAt, &expiresAt)
	if err != nil || revokedAt != nil || expiresAt.Before(time.Now()) {
		if revokedAt != nil {
			_, _ = db.Exec(ctx, `UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL`, claims.UserID)
		}
		sendJSON(w, http.StatusUnauthorized, map[string]string{"error": "Refresh token has been revoked or expired"})
		return
	}

	var user struct {
		ID    int
		Email string
		Role  string
	}
	err = db.QueryRow(ctx, `
		SELECT id, email, COALESCE(role, 'USER')
		FROM users
		WHERE id = $1
	`, claims.UserID).Scan(&user.ID, &user.Email, &user.Role)
	if err != nil {
		sendJSON(w, http.StatusUnauthorized, map[string]string{"error": "User not found"})
		return
	}

	// Revoke the old refresh token in DB
	_, _ = db.Exec(ctx, `
		UPDATE refresh_tokens
		SET revoked_at = NOW()
		WHERE token_id = $1 AND revoked_at IS NULL
	`, auth.HashTokenID(claims.TokenID))

	accessToken, err := auth.GenerateAccessToken(user.ID, user.Email, user.Role, h.jwtAccessSecret)
	if err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to generate token"})
		return
	}

	tokenID, newRefreshToken, err := auth.GenerateRefreshToken(user.ID, user.Email, user.Role, h.jwtRefreshSecret)
	if err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to generate refresh token"})
		return
	}

	// Store the new refresh token in DB
	_, _ = db.Exec(ctx, `
		INSERT INTO refresh_tokens (token_id, user_id, expires_at)
		VALUES ($1, $2, NOW() + INTERVAL '7 days')
		ON CONFLICT DO NOTHING
	`, auth.HashTokenID(tokenID), user.ID)

	sendJSON(w, http.StatusOK, map[string]interface{}{
		"success":       true,
		"access_token":  accessToken,
		"refresh_token": newRefreshToken,
	})
}

func (h *Handler) Logout(w http.ResponseWriter, r *http.Request) {
	claims := GetClaims(r)
	if claims == nil {
		sendJSON(w, http.StatusUnauthorized, map[string]string{"error": "Not authenticated"})
		return
	}

	db := h.gpsRepo.Pool()
	_, _ = db.Exec(r.Context(), `
		UPDATE refresh_tokens SET revoked_at = NOW()
		WHERE user_id = $1 AND revoked_at IS NULL
	`, claims.UserID)

	h.auditLogger.Log(r.Context(), audit.EventLogout, claims.UserID, claims.Email, clientIP(r), nil)
	sendJSON(w, http.StatusOK, map[string]interface{}{"success": true, "message": "Logged out successfully"})
}

func (h *Handler) GetUsers(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	db := h.gpsRepo.Pool()

	isAll := r.URL.Query().Get("all") == "true" || r.URL.Query().Get("page_size") == "-1"

	var total int
	err := db.QueryRow(ctx, `SELECT COUNT(*) FROM users`).Scan(&total)
	if err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to count users: " + err.Error()})
		return
	}

	var rows pgx.Rows
	var qerr error

	if isAll {
		rows, qerr = db.Query(ctx, `
			SELECT id, email, COALESCE(role, ''), created_at
			FROM users
			ORDER BY id ASC
		`)
	} else {
		page, pageSize := parsePagination(r)
		offset := (page - 1) * pageSize
		rows, qerr = db.Query(ctx, `
			SELECT id, email, COALESCE(role, ''), created_at
			FROM users
			ORDER BY id ASC
			LIMIT $1 OFFSET $2
		`, pageSize, offset)
	}

	if qerr != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to fetch users: " + qerr.Error()})
		return
	}
	defer rows.Close()

	var list []UserResponse = []UserResponse{}
	for rows.Next() {
		var u UserResponse
		if err := rows.Scan(&u.ID, &u.Email, &u.Role, &u.CreatedAt); err == nil {
			list = append(list, u)
		}
	}

	if isAll {
		sendJSON(w, http.StatusOK, map[string]interface{}{
			"success":     true,
			"data":        list,
			"total":       total,
			"page":        1,
			"page_size":   total,
			"total_pages": 1,
		})
	} else {
		page, pageSize := parsePagination(r)
		totalPages := (total + pageSize - 1) / pageSize
		sendJSON(w, http.StatusOK, map[string]interface{}{
			"success":     true,
			"data":        list,
			"total":       total,
			"page":        page,
			"page_size":   pageSize,
			"total_pages": totalPages,
		})
	}
}

func (h *Handler) CreateUser(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	db := h.gpsRepo.Pool()

	var req struct {
		Email    string `json:"email"`
		Password string `json:"password"`
		Role     string `json:"role"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid payload"})
		return
	}
	if req.Email == "" || req.Password == "" || req.Role == "" {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Email, password, and role are required"})
		return
	}

	if err := auth.ValidatePassword(req.Password); err != nil {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}

	hashedPassword, err := auth.HashPassword(req.Password)
	if err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to hash password"})
		return
	}

	var id int
	query := `
		INSERT INTO users (email, role, password_hash)
		VALUES ($1, $2, $3)
		ON CONFLICT (email) DO UPDATE SET role = $2, password_hash = $3
		RETURNING id
	`
	err = db.QueryRow(ctx, query, req.Email, req.Role, hashedPassword).Scan(&id)
	if err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to create user: " + err.Error()})
		return
	}

	claims := GetClaims(r)
	actorEmail := ""
	if claims != nil {
		actorEmail = claims.Email
	}
	h.auditLogger.Log(r.Context(), audit.EventUserCreate, id, req.Email, clientIP(r), map[string]interface{}{
		"role":       req.Role,
		"created_by": actorEmail,
	})
	sendJSON(w, http.StatusCreated, map[string]interface{}{"success": true, "id": id})
}

func (h *Handler) UpdateUser(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	db := h.gpsRepo.Pool()

	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid ID"})
		return
	}

	var req struct {
		Email    string `json:"email"`
		Role     string `json:"role"`
		Password string `json:"password,omitempty"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid payload"})
		return
	}
	if req.Email == "" || req.Role == "" {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Email and Role are required"})
		return
	}

	if req.Password != "" {
		if err := auth.ValidatePassword(req.Password); err != nil {
			sendJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}
		hashedPassword, err := auth.HashPassword(req.Password)
		if err != nil {
			sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to hash password"})
			return
		}
		_, err = db.Exec(ctx, `
			UPDATE users 
			SET email = $1, role = $2, password_hash = $3
			WHERE id = $4
		`, req.Email, req.Role, hashedPassword, id)
	} else {
		_, err = db.Exec(ctx, `
			UPDATE users 
			SET email = $1, role = $2
			WHERE id = $3
		`, req.Email, req.Role, id)
	}

	if err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to update user: " + err.Error()})
		return
	}

	claims := GetClaims(r)
	actorEmail := ""
	if claims != nil {
		actorEmail = claims.Email
	}
	h.auditLogger.Log(r.Context(), audit.EventUserUpdate, id, req.Email, clientIP(r), map[string]interface{}{
		"role":        req.Role,
		"password_set": req.Password != "",
		"updated_by":  actorEmail,
	})
	sendJSON(w, http.StatusOK, map[string]interface{}{"success": true})
}

func (h *Handler) DeleteUser(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	db := h.gpsRepo.Pool()

	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid ID"})
		return
	}

	_, err = db.Exec(ctx, `DELETE FROM users WHERE id = $1`, id)
	if err != nil {
		sendJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to delete user: " + err.Error()})
		return
	}

	claims := GetClaims(r)
	actorEmail := ""
	if claims != nil {
		actorEmail = claims.Email
	}
	h.auditLogger.Log(r.Context(), audit.EventUserDelete, id, "", clientIP(r), map[string]interface{}{
		"deleted_by": actorEmail,
	})
	sendJSON(w, http.StatusOK, map[string]interface{}{"success": true})
}
