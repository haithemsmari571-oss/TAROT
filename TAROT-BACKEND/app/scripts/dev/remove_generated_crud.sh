#!/bin/bash

model_name=$1
if [ -z "${model_name}" ]; then
  echo "Error: please provide the model name"
  exit 1
fi

model_name_snake=$(echo "$model_name" | sed -r 's/([A-Z])/_\L\1/g' | sed 's/^_//')
pl_model_name=''

model_name_to_pl() {
  local name=$1
  if [[ $name =~ [^aeiou]y$ ]]; then
    pl_model_name="${name::-1}ies"
  else
    pl_model_name="${name}s"
  fi
}

model_name_to_pl "$model_name_snake"

echo "Deleting CRUD for model: $model_name"
echo "Singular (snake_case): $model_name_snake"
echo "Plural: $pl_model_name"

delete_generate_crud() {
  echo "Deleting model..."
  rm -f app/models/"$model_name_snake".py

  echo "Deleting schema..."
  rm -f app/schemas/"$model_name_snake".py

  echo "Deleting exceptions..."
  rm -f app/exceptions/"$pl_model_name".py

  echo "Deleting service..."
  rm -f app/services/"$pl_model_name".py

  echo "Deleting routers..."
  rm -f app/routers/"$pl_model_name".py

  echo "All CRUD files for $model_name deleted."
}

delete_generate_crud
