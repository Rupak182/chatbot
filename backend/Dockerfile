FROM python:3.12-slim

WORKDIR /app

# Prevent Python from writing .pyc files and buffer streams
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# Install uv for blazingly fast dependency management
RUN pip install --no-cache-dir uv

# Copy project manifest files first to utilize Docker layer cache
COPY pyproject.toml uv.lock* ./

# Synchronize dependencies directly into the system python environment
RUN uv pip install --system --no-cache -r pyproject.toml

# Copy the actual application files
COPY . .

# Expose the standard FastAPI backend port
EXPOSE 8000

# Boot uvicorn server binding to all network interfaces
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
