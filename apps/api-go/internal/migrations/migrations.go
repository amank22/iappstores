// Package migrations embeds the .sql schema files applied by dbconn at startup.
package migrations

import "embed"

//go:embed *.sql
var Files embed.FS
