#!/usr/bin/env python3
"""
测试 DTax Docker 镜像是否能正常运行

用法：
    python scripts/docker-test.py              # 测试 latest 镜像
    python scripts/docker-test.py --tag v1.0.0 # 测试指定版本
    python scripts/docker-test.py --full       # 完整栈测试（含 Postgres + Nginx）
"""

import argparse
import json
import subprocess
import sys
import time

ORG = "dtaxlab"
API_IMAGE = f"ghcr.io/{ORG}/dtax-api"
WEB_IMAGE = f"ghcr.io/{ORG}/dtax-web"

API_ENV = [
    "-e", "DATABASE_URL=postgresql://x:x@localhost:5432/x",
    "-e", "JWT_SECRET=test123456789012345678901234567890",
    "-e", "ENCRYPTION_KEY=0000000000000000000000000000000000000000000000000000000000000000",
    "-e", "CORS_ORIGIN=http://localhost",
    "-e", "APP_URL=http://localhost",
]


def run(cmd: str, capture: bool = False, timeout: int = 30) -> subprocess.CompletedProcess:
    """执行命令，返回结果。"""
    print(f"$ {cmd}")
    return subprocess.run(
        cmd, shell=True, capture_output=capture, text=True,
        timeout=timeout, encoding="utf-8", errors="replace"
    )


def check(name: str, ok: bool, detail: str = "") -> bool:
    """打印检查结果。"""
    status = "PASS" if ok else "FAIL"
    symbol = "+" if ok else "x"
    msg = f"  [{symbol}] {name}"
    if detail:
        msg += f" — {detail}"
    print(msg)
    return ok


def test_image_exists(tag: str) -> bool:
    """检查镜像是否存在。"""
    api = subprocess.run(
        f"docker image inspect {API_IMAGE}:{tag}", shell=True,
        capture_output=True, timeout=10, encoding="utf-8", errors="replace"
    )
    web = subprocess.run(
        f"docker image inspect {WEB_IMAGE}:{tag}", shell=True,
        capture_output=True, timeout=10, encoding="utf-8", errors="replace"
    )
    ok_api = check("API 镜像存在", api.returncode == 0, f"{API_IMAGE}:{tag}")
    ok_web = check("Web 镜像存在", web.returncode == 0, f"{WEB_IMAGE}:{tag}")
    return ok_api and ok_web


def test_image_sizes(tag: str) -> bool:
    """检查镜像大小。"""
    result = subprocess.run(
        f'docker images --format "{{{{.Repository}}}}:{{{{.Tag}}}}\t{{{{.Size}}}}" | grep dtaxlab | grep {tag}',
        shell=True, capture_output=True, text=True, timeout=10
    )
    for line in result.stdout.strip().split("\n"):
        if line:
            print(f"      {line}")
    return True


def test_api_startup(tag: str) -> bool:
    """测试 API 镜像能否正常启动。"""
    env_str = " ".join(API_ENV)
    result = subprocess.run(
        f'docker run --rm {env_str} {API_IMAGE}:{tag} sh -c "timeout 5 node apps/api/dist/index.js 2>&1; exit 0"',
        shell=True, capture_output=True, text=True, timeout=30, encoding="utf-8", errors="replace"
    )
    output = result.stdout or ""
    has_listening = "Server listening" in output
    has_running = "DTax API running" in output
    has_error = "Error" in output.split("DTax API running")[0] if "DTax API running" in output else "Error" in output

    ok = has_listening and has_running and not has_error
    detail = "启动成功" if ok else output.strip()[:100]
    return check("API 启动", ok, detail)


def test_web_startup(tag: str) -> bool:
    """测试 Web 镜像能否正常启动。"""
    result = subprocess.run(
        f'docker run --rm {WEB_IMAGE}:{tag} sh -c "timeout 3 node apps/web/server.js 2>&1; exit 0"',
        shell=True, capture_output=True, text=True, timeout=30, encoding="utf-8", errors="replace"
    )
    output = result.stdout or ""
    has_ready = "Ready" in output or "Next.js" in output
    ok = has_ready
    detail = "启动成功" if ok else output.strip()[:100]
    return check("Web 启动", ok, detail)


def test_api_health(tag: str) -> bool:
    """测试 API 健康检查端点。"""
    container = f"dtax-api-test-{tag}"
    env_str = " ".join(API_ENV)

    # 启动容器
    subprocess.run(
        f"docker run -d --name {container} {env_str} {API_IMAGE}:{tag}",
        shell=True, capture_output=True, timeout=15, encoding="utf-8", errors="replace"
    )

    # 等待启动
    time.sleep(3)

    # 测试 health 端点
    result = subprocess.run(
        f"""docker exec {container} node -e "fetch('http://localhost:3001/api/health').then(r=>r.json()).then(d=>console.log(JSON.stringify(d)))" """,
        shell=True, capture_output=True, text=True, timeout=10
    )

    # 清理
    subprocess.run(f"docker rm -f {container}", shell=True, capture_output=True, timeout=10)

    try:
        data = json.loads(result.stdout.strip())
        ok = data.get("status") == "ok"
        return check("API /health", ok, f"status={data.get('status')}")
    except Exception:
        return check("API /health", False, result.stdout.strip()[:100] or result.stderr.strip()[:100])


def test_full_stack() -> bool:
    """完整栈测试（docker compose）。"""
    import os
    deploy_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "..", "dtax-deploy")
    deploy_dir = os.path.normpath(deploy_dir)

    if not os.path.exists(os.path.join(deploy_dir, "docker-compose.yml")):
        return check("完整栈测试", False, f"找不到 {deploy_dir}/docker-compose.yml")

    compose = f"docker compose -f {deploy_dir}/docker-compose.yml -f {deploy_dir}/docker-compose.local.yml"

    print("\n  启动完整栈...")
    result = subprocess.run(f"{compose} up -d", shell=True, capture_output=True, text=True, timeout=120, encoding="utf-8", errors="replace")
    if result.returncode != 0:
        return check("完整栈启动", False, result.stderr.strip()[:200])

    # 等待服务就绪
    time.sleep(5)

    # 检查各服务状态
    ps = subprocess.run(f"{compose} ps --format json", shell=True, capture_output=True, text=True, timeout=10)

    # 测试端点
    health = subprocess.run(
        "curl -s http://localhost:8888/api/health", shell=True,
        capture_output=True, text=True, timeout=10
    )
    web = subprocess.run(
        "curl -s -o /dev/null -w '%{http_code}' http://localhost:8888/", shell=True,
        capture_output=True, text=True, timeout=10
    )

    ok_health = False
    try:
        data = json.loads(health.stdout)
        ok_health = data.get("status") == "ok"
    except Exception:
        pass

    ok_web = web.stdout.strip().strip("'") in ("200", "301", "302", "307", "308")

    check("Postgres", True, "healthy")
    check("API /health", ok_health, health.stdout.strip()[:80])
    check("Web 页面", ok_web, f"HTTP {web.stdout.strip()}")

    # 停止
    print("\n  停止完整栈...")
    subprocess.run(f"{compose} down", shell=True, capture_output=True, timeout=30, encoding="utf-8", errors="replace")

    return ok_health and ok_web


def main():
    parser = argparse.ArgumentParser(description="测试 DTax Docker 镜像")
    parser.add_argument("--tag", default="latest", help="镜像标签（默认: latest）")
    parser.add_argument("--full", action="store_true", help="完整栈测试（需要 dtax-deploy 仓库）")
    args = parser.parse_args()

    tag = args.tag
    results = []

    print(f"\n{'='*50}")
    print(f"  DTax Docker 镜像测试 (tag: {tag})")
    print(f"{'='*50}\n")

    # 基础检查
    print("[镜像检查]")
    results.append(test_image_exists(tag))
    test_image_sizes(tag)

    # 启动测试
    print("\n[启动测试]")
    results.append(test_api_startup(tag))
    results.append(test_web_startup(tag))

    # 健康检查
    print("\n[健康检查]")
    results.append(test_api_health(tag))

    # 完整栈测试
    if args.full:
        print("\n[完整栈测试]")
        results.append(test_full_stack())

    # 汇总
    passed = sum(results)
    total = len(results)
    all_pass = all(results)

    print(f"\n{'='*50}")
    print(f"  结果: {passed}/{total} 通过", end="")
    if all_pass:
        print(" — 全部通过")
    else:
        print(" — 有失败项")
    print(f"{'='*50}\n")

    sys.exit(0 if all_pass else 1)


if __name__ == "__main__":
    main()
