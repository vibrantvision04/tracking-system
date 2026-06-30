package api

import (
	"context"
	"net/http"
)

type permissionKey string

const userPermissionsKey permissionKey = "permissions"

// rbacChecker is the minimal RBAC surface the permission middleware needs.
// *repository.RBACRepository satisfies it transparently; tests provide their
// own implementation via Handler.rbacCheckOverride so the middleware chain
// can be exercised without a real database.
type rbacChecker interface {
	IsSuperAdmin(ctx context.Context, userID int) (bool, error)
	HasPermission(ctx context.Context, userID int, permissionCode string) (bool, error)
	GetUserPermissions(ctx context.Context, userID int) ([]string, error)
}

// rbacCheck returns the active RBAC checker. When Handler.rbacCheckOverride
// is non-nil (test-only seam) it wins; otherwise the production
// *repository.RBACRepository field is returned. Callers must still guard
// against a nil return when the handler was constructed without either.
func (h *Handler) rbacCheck() rbacChecker {
	if h.rbacCheckOverride != nil {
		return h.rbacCheckOverride
	}
	if h.rbacRepo == nil {
		return nil
	}
	return h.rbacRepo
}

// RequirePermission checks if the authenticated user has the given permission.
// Super Admin (role_id=1) bypasses all checks.
func (h *Handler) RequirePermission(permissionCode string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			claims := GetClaims(r)
			if claims == nil {
				RespondWithError(w, http.StatusUnauthorized, "Not authenticated")
				return
			}

			checker := h.rbacCheck()
			if checker == nil {
				RespondWithError(w, http.StatusInternalServerError, "RBAC not configured")
				return
			}

			// Super Admin bypass
			isSuper, _ := checker.IsSuperAdmin(r.Context(), claims.UserID)
			if isSuper {
				next.ServeHTTP(w, r)
				return
			}

			has, err := checker.HasPermission(r.Context(), claims.UserID, permissionCode)
			if err != nil || !has {
				RespondWithError(w, http.StatusForbidden, "Insufficient permissions")
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

// PermissionMiddleware loads the user's permissions into the request context.
func (h *Handler) PermissionMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		claims := GetClaims(r)
		if claims == nil {
			next.ServeHTTP(w, r)
			return
		}

		checker := h.rbacCheck()
		if checker == nil {
			next.ServeHTTP(w, r)
			return
		}

		isSuper, _ := checker.IsSuperAdmin(r.Context(), claims.UserID)
		var perms []string
		if isSuper {
			perms = []string{"*"}
		} else {
			perms, _ = checker.GetUserPermissions(r.Context(), claims.UserID)
		}
		if perms == nil {
			perms = []string{}
		}
		ctx := context.WithValue(r.Context(), userPermissionsKey, perms)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// GetPermissions retrieves the current user's permissions from context.
func GetPermissions(r *http.Request) []string {
	perms, _ := r.Context().Value(userPermissionsKey).([]string)
	return perms
}
