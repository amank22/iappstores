package httpapi

import (
	"encoding/json"
	"net/http"

	"github.com/iappstores/api-go/internal/contracts"
)

// writeJSON mirrors Express's res.json(): sets the content type and marshals body.
func writeJSON(w http.ResponseWriter, status int, body interface{}) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	enc := json.NewEncoder(w)
	enc.SetEscapeHTML(false)
	_ = enc.Encode(body)
}

// sendError mirrors http.ts's sendError(): { error: { code, message, details? } }, with
// `details` entirely absent from the JSON when nil (matching the zod .optional() field).
func sendError(w http.ResponseWriter, status int, code, message string, details interface{}) {
	writeJSON(w, status, contracts.ApiErrorResponse{
		Error: contracts.ApiError{Code: code, Message: message, Details: details},
	})
}

func errDetails(err error) map[string]string {
	if err == nil {
		return nil
	}
	return map[string]string{"message": err.Error()}
}
