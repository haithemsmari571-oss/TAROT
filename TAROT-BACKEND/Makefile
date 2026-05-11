SQLITE_DB=./dev.db

UVRUN=uv run

.PHONY: run
up:
	@echo "[APP] starting app"
	@$(UVRUN) uvicorn app.main:app --reload --port 8000 --log-level debug  

.PHONY: debug
debug:
	@echo "[APP] starting app with DAP debugger"
	@$(UVRUN) python -m debugpy --listen 5678 --wait-for-client -m uvicorn app.main:app --port 8000 


.PHONY: reset
reset:
	@echo "[DB] Dropping database..."
	@if [ -f $(SQLITE_DB) ]; then rm $(SQLITE_DB); fi
	@echo "[DB] Stamping database as base..."
	@$(UVRUN) alembic stamp base
	@echo "[DB] Generating initial migration..."
	@$(UVRUN) alembic revision --autogenerate -m "init"
	@echo "[DB] Applying migrations..."
	@$(UVRUN) alembic upgrade head
	@echo "[DB] Database reset complete"

.PHONY: 
seed:
	@echo "[SEED] Seeding database..."
	@$(UVRUN) -m app.database.seeders.seed

.PHONY: upgrade
upgrade:
	@$(UVRUN) alembic upgrade head

.PHONY: downgrade
downgrade:
	@$(UVRUN) alembic downgrade base
.PHONY: mock
mock:
	@$(UVRUN) uvicorn app.mock.api_network:app --reload --port 8001

.PHONY: generate_crud

GENERATE_SCRIPT=./app/scripts/dev/crud_generator.sh

generate_crud:
	@if [ -z "$(MODEL)" ]; then \
		echo "Usage: make generate_crud MODEL=<ModelName>"; \
		exit 1; \
	fi
	@$(GENERATE_SCRIPT) $(MODEL)

.PHONY: rm_generated_crud

RM_GENERATED_SCRIPT=./app/scripts/dev/remove_generated_crud.sh

rm_generated_crud:
	@if [ -z "$(MODEL)" ]; then \
		echo "Usage: make rm_generated_crud MODEL=<ModelName>"; \
		exit 1; \
	fi
	@$(RM_GENERATED_SCRIPT) $(MODEL)





