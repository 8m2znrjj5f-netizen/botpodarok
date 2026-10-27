"""Telegram-бот-подарок: присылает фото пары и открывает мини-приложение.

Бот написан на aiogram 3.x.

Что делает:
  * /start — отправляет фото assets/photo.jpg с тёплой подписью и inline-кнопкой
    «Открыть подарок ❤️», которая открывает Web App;
  * при запуске ставит постоянную кнопку меню чата (set_chat_menu_button), поэтому
    мини-приложение можно открыть прямо из поля ввода;
  * /help — короткая подсказка;
  * проверяет, что WEBAPP_URL начинается с https:// (Telegram открывает Web App
    только по HTTPS), и понятно сообщает, что исправить.

Запуск:
    pip install -r requirements.txt
    python bot.py
"""

from __future__ import annotations

import asyncio
import logging
import os
import sys
from dataclasses import dataclass
from html import escape
from pathlib import Path

from aiogram import Bot, Dispatcher, Router
from aiogram.client.default import DefaultBotProperties
from aiogram.enums import ParseMode
from aiogram.exceptions import TelegramAPIError
from aiogram.filters import Command, CommandStart
from aiogram.types import (
    FSInputFile,
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    MenuButtonWebApp,
    Message,
    WebAppInfo,
)

try:  # python-dotenv нужен только для удобной работы с bot/.env
    from dotenv import load_dotenv
except ImportError:  # без него бот прекрасно работает с обычными переменными окружения
    load_dotenv = None  # type: ignore[assignment]


# --- Пути ------------------------------------------------------------------

BOT_DIR = Path(__file__).resolve().parent
PROJECT_DIR = BOT_DIR.parent
PHOTO_PATH = PROJECT_DIR / "assets" / "photo.jpg"
ENV_PATH = BOT_DIR / ".env"

BOT_TOKEN_ENV = "BOT_TOKEN"
WEBAPP_URL_ENV = "WEBAPP_URL"


# --- Тексты (все — для людей, по-русски) -----------------------------------

GIFT_BUTTON_TEXT = "Открыть подарок ❤️"

START_CAPTION = (
    "<b>{name}, это тебе 🤍</b>\n\n"
    "Маленький подарок, который мы собрали с любовью.\n"
    "Нажми на кнопку ниже — и загляни внутрь ❤️"
)

START_CAPTION_NO_NAME = (
    "<b>Это тебе 🤍</b>\n\n"
    "Маленький подарок, который мы собрали с любовью.\n"
    "Нажми на кнопку ниже — и загляни внутрь ❤️"
)

HELP_TEXT = (
    "<b>Как открыть подарок</b>\n\n"
    "• Нажми на кнопку «Открыть подарок ❤️» под фотографией.\n"
    "• Или нажми на кнопку меню рядом с полем ввода — мини-приложение "
    "откроется прямо в чате.\n\n"
    "Если кнопка не появилась — отправь /start ещё раз."
)

OTHER_TEXT = (
    "Я здесь только ради подарка ❤️\n"
    "Открой его кнопкой ниже — или загляни в меню рядом с полем ввода."
)

MISSING_PHOTO_TEXT = (
    "Подарок почти готов ❤️\n"
    "Сейчас открою его — нажми на кнопку ниже."
)


class ConfigError(RuntimeError):
    """Ошибка в настройках, которую нужно показать человеку, а не трейсбеком."""


# --- Настройки -------------------------------------------------------------


@dataclass(frozen=True)
class Settings:
    """Всё, что боту нужно знать о мире."""

    bot_token: str
    webapp_url: str


logger = logging.getLogger("gift-bot")


def _load_env_file() -> None:
    """Подхватывает bot/.env, если он есть (не перетирая уже заданные переменные)."""

    if not ENV_PATH.is_file():
        logger.info("Файл %s не найден — беру переменные окружения.", ENV_PATH.name)
        return

    if load_dotenv is None:
        logger.warning(
            "Найден %s, но пакет python-dotenv не установлен. "
            "Установи зависимости: pip install -r requirements.txt "
            "(или задай BOT_TOKEN и WEBAPP_URL в переменных окружения).",
            ENV_PATH,
        )
        return

    load_dotenv(dotenv_path=ENV_PATH, override=False)
    logger.info("Настройки подхвачены из %s", ENV_PATH)


def _validate_webapp_url(webapp_url: str) -> str:
    """Проверяет адрес мини-приложения и возвращает его же без изменений."""

    if not webapp_url:
        raise ConfigError(
            f"Не задан {WEBAPP_URL_ENV} — публичный HTTPS-адрес мини-приложения.\n"
            f"Открой {ENV_PATH} и добавь строку:\n"
            f"    {WEBAPP_URL_ENV}=https://<твой-домен>/"
        )

    if not webapp_url.lower().startswith("https://"):
        raise ConfigError(
            f"{WEBAPP_URL_ENV} должен начинаться с https:// — Telegram открывает "
            "мини-приложения только по HTTPS.\n"
            f"Сейчас указано: {webapp_url!r}\n"
            "Как исправить:\n"
            "  • локальная проверка: http://localhost:8000 подними через "
            "`ngrok http 8000` и укажи https://<адрес>.ngrok-free.app;\n"
            "  • постоянный хостинг: GitHub Pages, Vercel или Netlify — "
            "все выдают HTTPS-адрес бесплатно."
        )

    return webapp_url


def load_settings() -> Settings:
    """Читает .env и переменные окружения, проверяет значения.

    Токен нигде не логируется — даже частично.
    """

    _load_env_file()

    bot_token = (os.getenv(BOT_TOKEN_ENV) or "").strip()
    webapp_url = (os.getenv(WEBAPP_URL_ENV) or "").strip()

    if not bot_token:
        raise ConfigError(
            f"Не задан {BOT_TOKEN_ENV}.\n"
            f"Скопируй {ENV_PATH.name}.example в {ENV_PATH.name} и вставь токен "
            "из @BotFather (/newbot)."
        )

    token_head, _, token_tail = bot_token.partition(":")
    if (
        not token_head.isdigit()
        or not token_tail
        or any(char.isspace() for char in bot_token)
    ):
        raise ConfigError(
            f"{BOT_TOKEN_ENV} выглядит неправильно: ожидается токен вида "
            "«123456789:AA...», который выдаёт @BotFather (/newbot).\n"
            "Сам токен в лог не выводится — открой bot/.env и проверь значение."
        )

    _validate_webapp_url(webapp_url)

    return Settings(
        bot_token=bot_token,
        # Тут уже гарантированно https://
        webapp_url=webapp_url,
    )


# --- Клавиатуры ------------------------------------------------------------


def gift_keyboard(webapp_url: str) -> InlineKeyboardMarkup:
    """Inline-кнопка, открывающая Web App с подарком."""

    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text=GIFT_BUTTON_TEXT,
                    web_app=WebAppInfo(url=webapp_url),
                )
            ]
        ]
    )


# --- Обработчики -----------------------------------------------------------

router = Router(name="gift")


def _display_name(message: Message) -> str:
    user = message.from_user
    if user is None:
        return ""
    return (user.first_name or user.full_name or "").strip()


@router.message(CommandStart())
async def handle_start(message: Message, webapp_url: str) -> None:
    """/start — фото + поздравление + кнопка «Открыть подарок ❤️»."""

    user = message.from_user
    logger.info("/start от пользователя id=%s", user.id if user else "неизвестен")

    name = _display_name(message)
    caption = START_CAPTION.format(name=escape(name)) if name else START_CAPTION_NO_NAME

    if PHOTO_PATH.is_file():
        await message.answer_photo(
            photo=FSInputFile(PHOTO_PATH, filename="photo.jpg"),
            caption=caption,
            reply_markup=gift_keyboard(webapp_url),
        )
        return

    # Фото не нашлось — подарок всё равно должен открыться.
    logger.error(
        "Не найден файл фото: %s. Отправляю сообщение без фотографии. "
        "Проверь, что assets/photo.jpg лежит рядом с папкой bot/.",
        PHOTO_PATH,
    )
    await message.answer(
        MISSING_PHOTO_TEXT,
        reply_markup=gift_keyboard(webapp_url),
    )


@router.message(Command("help"))
async def handle_help(message: Message, webapp_url: str) -> None:
    """/help — как открыть подарок."""

    await message.answer(HELP_TEXT, reply_markup=gift_keyboard(webapp_url))


@router.message()
async def handle_other(message: Message, webapp_url: str) -> None:
    """Любое другое сообщение — мягко возвращаем к подарку."""

    await message.answer(OTHER_TEXT, reply_markup=gift_keyboard(webapp_url))


# --- Запуск ----------------------------------------------------------------


async def _configure_menu_button(bot: Bot, webapp_url: str) -> None:
    """Постоянная кнопка меню чата — мини-приложение из поля ввода.

    Такая кнопка показывается в приватных чатах с ботом (и в группах, где
    разрешены меню-кнопки). Ошибку не глотаем молча: в логе будет подсказка.
    """

    try:
        await bot.set_chat_menu_button(
            menu_button=MenuButtonWebApp(
                text=GIFT_BUTTON_TEXT,
                web_app=WebAppInfo(url=webapp_url),
            )
        )
    except TelegramAPIError as exc:
        logger.error(
            "Не удалось поставить кнопку меню чата: %s. "
            "Проверь, что WEBAPP_URL — публичный HTTPS-адрес, а бот не заблокирован.",
            exc,
        )
        return

    logger.info("Кнопка меню «%s» установлена для всех чатов.", GIFT_BUTTON_TEXT)


async def run_bot(settings: Settings) -> None:
    """Создаёт бота, настраивает меню и уходит в long polling."""

    bot = Bot(
        token=settings.bot_token,
        default=DefaultBotProperties(parse_mode=ParseMode.HTML),
    )
    dispatcher = Dispatcher(webapp_url=settings.webapp_url)
    dispatcher.include_router(router)

    try:
        me = await bot.get_me()
        logger.info("Бот @%s (id=%s) на связи.", me.username, me.id)
        logger.info("Мини-приложение: %s", settings.webapp_url)

        await _configure_menu_button(bot, settings.webapp_url)

        logger.info("Слушаю сообщения… (Ctrl+C — остановить)")
        await dispatcher.start_polling(
            bot,
            allowed_updates=dispatcher.resolve_used_update_types(),
        )
    finally:
        await bot.session.close()


def main() -> int:
    """Точка входа: настройки, логи, polling, аккуратная остановка."""

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
        datefmt="%H:%M:%S",
    )
    # aiogram пишет событие на каждый апдейт на INFO — нам это не нужно.
    logging.getLogger("aiogram.event").setLevel(logging.WARNING)

    try:
        settings = load_settings()
    except ConfigError as exc:
        logger.critical("Бот не запущен.\n%s", exc)
        return 1

    try:
        asyncio.run(run_bot(settings))
    except (KeyboardInterrupt, SystemExit):
        logger.info("Остановлено вручную. До встречи ❤️")
    except TelegramAPIError as exc:
        logger.critical("Telegram API не принял запрос: %s", exc)
        logger.critical(
            "Чаще всего дело в BOT_TOKEN (проверь bot/.env) "
            "или в доступе к api.telegram.org."
        )
        return 1
    except OSError as exc:
        logger.critical("Похоже, нет связи с интернетом: %s", exc)
        return 1

    return 0


if __name__ == "__main__":
    sys.exit(main())
